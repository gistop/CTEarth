import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessagePartText,
} from '@assistant-ui/react';
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import {
  Bot,
  CircleStop,
  Globe2,
  KeyRound,
  RotateCcw,
  SendHorizontal,
  Server,
  Sparkles,
  User,
} from 'lucide-react';
import {
  useGis,
  type BufferParameters,
  type IdwParameters,
  type SelectByLocationParameters,
  type SelectByLocationRelation,
  type SelectByValueOperator,
  type SelectByValueParameters,
  type SelectionMode,
  type SlopeUnits,
  type TerrainParameters,
  type TerrainToolId,
} from '../../gisStore';

const DIRECT_API_URL = 'https://api.deepseek.com/chat/completions';
const STORAGE_KEY = 'ctearth-ai-deepseek-key';
const configuredProxyApi = import.meta.env.VITE_AI_CHAT_API || '/api/chat';

type ChatMode = 'proxy' | 'direct';
type GisRuntime = ReturnType<typeof useGis>;
type AgentToolStatus = 'success' | 'blocked' | 'failed';
type AgentToolResult = {
  ok: boolean;
  status: AgentToolStatus;
  tool: string;
  message: string;
  qa: {
    passed: boolean;
    checks: string[];
  };
  output?: Record<string, unknown>;
};

type DeepSeekChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_call_id?: string;
  tool_calls?: DeepSeekToolCall[];
};

type DeepSeekToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type DeepSeekTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const systemPrompt = [
  'You are CTEarth AI, a concise GIS and remote sensing assistant.',
  'Reply in the user language.',
  'When the user asks to operate the current map, use the available GIS tools instead of only explaining.',
  'The GIS runtime is entirely in the browser with WASM. Tool distances and cell sizes use the current input data coordinate units.',
  'If required parameters or layers are missing, ask one short follow-up question.',
  'When the user asks for choices, use A. B. C. D. option format.',
].join('\n');

const gisTools: DeepSeekTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_layers',
      description: 'Inspect the current CTEarth map state, uploaded layers, active layer, numeric fields, and existing analysis outputs.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buffer_vector',
      description: 'Run the browser WASM vector buffer tool on the active uploaded layer and add the output as a vector overlay.',
      parameters: {
        type: 'object',
        properties: {
          distance: {
            type: 'number',
            description: 'Positive buffer distance in the input layer coordinate units.',
          },
          outputName: {
            type: 'string',
            description: 'Optional output GeoJSON file name.',
          },
          quadrantSegments: {
            type: 'integer',
            description: 'Optional number of segments used to approximate round joins. Default is 8.',
          },
          capStyle: {
            type: 'string',
            enum: ['round', 'flat', 'square'],
            description: 'Optional buffer cap style.',
          },
          joinStyle: {
            type: 'string',
            enum: ['round', 'bevel', 'mitre'],
            description: 'Optional buffer join style.',
          },
          dissolve: {
            type: 'boolean',
            description: 'Whether to dissolve buffer results into one feature.',
          },
        },
        required: ['distance'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select_by_value',
      description: 'Select features on the active uploaded layer by comparing one attribute field to a value.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description: 'Attribute field name on the active layer.',
          },
          operator: {
            type: 'string',
            enum: ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'isEmpty', 'isNotEmpty'],
            description: 'Attribute comparison operator.',
          },
          value: {
            type: 'string',
            description: 'Comparison value. Omit or leave empty for isEmpty/isNotEmpty.',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Whether string comparison should be case-sensitive. Default is false.',
          },
          selectionMode: {
            type: 'string',
            enum: ['new', 'add', 'remove', 'subset'],
            description: 'How to apply matches to the current selection set. Default is new.',
          },
        },
        required: ['field', 'operator'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select_by_location',
      description: 'Select features on the active uploaded layer by testing a spatial relation against another uploaded layer or the current vector overlay.',
      parameters: {
        type: 'object',
        properties: {
          referenceLayerId: {
            type: 'string',
            description: 'Reference layer id. Use vectorOverlay for the current vector overlay result, or an uploaded layer id from list_layers.',
          },
          relation: {
            type: 'string',
            enum: ['intersects', 'within', 'contains', 'disjoint'],
            description: 'Spatial relation from target features to the reference layer. Default is intersects.',
          },
          selectionMode: {
            type: 'string',
            enum: ['new', 'add', 'remove', 'subset'],
            description: 'How to apply matches to the current selection set. Default is new.',
          },
        },
        required: ['referenceLayerId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hillshade',
      description: 'Run GeoLibre Hillshade on the current DEM GeoTIFF raster and display the output raster.',
      parameters: {
        type: 'object',
        properties: {
          outputName: {
            type: 'string',
            description: 'Optional output GeoTIFF file name.',
          },
          zFactor: {
            type: 'number',
            description: 'Optional vertical exaggeration / Z conversion factor. Default is 1.',
          },
          altitude: {
            type: 'number',
            description: 'Optional illumination altitude in degrees from 0 to 90. Default is 45.',
          },
          azimuth: {
            type: 'number',
            description: 'Optional illumination azimuth in degrees clockwise from north. Default is 315.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'slope',
      description: 'Run GeoLibre Slope on the current DEM GeoTIFF raster and display the output raster.',
      parameters: {
        type: 'object',
        properties: {
          outputName: {
            type: 'string',
            description: 'Optional output GeoTIFF file name.',
          },
          zFactor: {
            type: 'number',
            description: 'Optional Z conversion factor. Default is 1.',
          },
          units: {
            type: 'string',
            enum: ['degrees', 'radians', 'percent'],
            description: 'Slope output units. Default is degrees.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aspect',
      description: 'Run GeoLibre Aspect on the current DEM GeoTIFF raster and display the output raster.',
      parameters: {
        type: 'object',
        properties: {
          outputName: {
            type: 'string',
            description: 'Optional output GeoTIFF file name.',
          },
          zFactor: {
            type: 'number',
            description: 'Optional Z conversion factor. Default is 1.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'idw_interpolation',
      description: 'Run the browser WASM IDW interpolation tool on the active point layer and add the output as a raster overlay.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description: 'Numeric field to interpolate. If omitted, CTEarth uses the active layer selected field.',
          },
          outputName: {
            type: 'string',
            description: 'Optional output GeoTIFF file name.',
          },
          cellSize: {
            type: 'number',
            description: 'Positive output pixel size in the input layer coordinate units.',
          },
          weight: {
            type: 'number',
            description: 'Positive IDW power parameter. Default is 2.',
          },
          radius: {
            type: 'number',
            description: 'Non-negative search radius. 0 means automatic/no fixed radius.',
          },
          minPoints: {
            type: 'integer',
            description: 'Non-negative minimum point count. Default is 0.',
          },
        },
        additionalProperties: false,
      },
    },
  },
];

export function AiAssistantPanel() {
  const [sessionId, setSessionId] = useState(0);

  return (
    <AssistantSession
      key={sessionId}
      onReset={() => setSessionId((current) => current + 1)}
    />
  );
}

function AssistantSession({
  onReset,
}: {
  onReset: () => void;
}) {
  const gis = useGis();
  const [mode, setMode] = useState<ChatMode>('direct');
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [model, setModel] = useState('deepseek-chat');
  const gisRef = useRef(gis);
  const apiKeyRef = useRef(apiKey);
  const modelRef = useRef(model);

  useEffect(() => {
    gisRef.current = gis;
  }, [gis]);

  useEffect(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY) ?? '';

    if (savedKey) {
      setApiKey(savedKey);
      setRememberKey(true);
    }
  }, []);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const executeGisTool = useCallback((name: string, input: Record<string, unknown>) => (
    executeBrowserGisTool(name, input, gisRef)
  ), []);

  const transport = useMemo<ChatTransport<UIMessage>>(() => {
    if (mode === 'proxy') {
      return new AssistantChatTransport({ api: configuredProxyApi });
    }

    return new DeepSeekBrowserTransport({
      executeGisTool,
      getGisContext: () => summarizeGisContext(gisRef.current),
      getApiKey: () => apiKeyRef.current,
      getModel: () => modelRef.current,
      system: systemPrompt,
    });
  }, [executeGisTool, mode]);

  const runtime = useChatRuntime({ transport });

  const updateApiKey = (nextKey: string) => {
    setApiKey(nextKey);

    if (rememberKey) {
      localStorage.setItem(STORAGE_KEY, nextKey.trim());
    }
  };

  const updateRememberKey = (nextRemember: boolean) => {
    setRememberKey(nextRemember);

    if (nextRemember && apiKey.trim()) {
      localStorage.setItem(STORAGE_KEY, apiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="ai-assistant-panel" aria-label="AI assistant">
        <ChatThread
          apiKey={apiKey}
          mode={mode}
          model={model}
          onApiKeyChange={updateApiKey}
          onModeChange={setMode}
          onModelChange={setModel}
          onRememberKeyChange={updateRememberKey}
          onReset={onReset}
          rememberKey={rememberKey}
        />
      </section>
    </AssistantRuntimeProvider>
  );
}

function ChatThread({
  apiKey,
  mode,
  model,
  onApiKeyChange,
  onModeChange,
  onModelChange,
  onRememberKeyChange,
  onReset,
  rememberKey,
}: {
  apiKey: string;
  mode: ChatMode;
  model: string;
  onApiKeyChange: (value: string) => void;
  onModeChange: (value: ChatMode) => void;
  onModelChange: (value: string) => void;
  onRememberKeyChange: (value: boolean) => void;
  onReset: () => void;
  rememberKey: boolean;
}) {
  return (
    <ThreadPrimitive.Root className="ai-thread-root">
      <header className="ai-thread-header">
        <div className="ai-thread-title">
          <Sparkles size={15} />
          <span>AI 助手</span>
        </div>
        <div className="ai-thread-controls">
          <AiInlineSettings
            apiKey={apiKey}
            compact
            mode={mode}
            model={model}
            onApiKeyChange={onApiKeyChange}
            onModeChange={onModeChange}
            onModelChange={onModelChange}
            onRememberKeyChange={onRememberKeyChange}
            rememberKey={rememberKey}
          />
          <button className="ai-icon-button" type="button" title="重置" aria-label="重置" onClick={onReset}>
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      <ThreadPrimitive.Viewport className="ai-thread-viewport">
        <MapAwarenessCard />

        <ThreadPrimitive.Empty>
          <div className="ai-empty-state">
            <Bot size={20} />
            <p>可以询问图层、字段、插值、缓冲区和制图流程。</p>
            <div className="ai-suggestions">
              <ThreadPrimitive.Suggestion
                className="ai-suggestion"
                method="replace"
                prompt="请根据当前图层给我一个 GIS 分析建议"
              >
                分析建议
              </ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion
                className="ai-suggestion"
                method="replace"
                prompt="IDW 插值需要注意哪些参数？"
              >
                IDW 参数
              </ThreadPrimitive.Suggestion>
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className="ai-viewport-footer">
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function MapAwarenessCard() {
  const gis = useGis();
  const context = getSelectedMapContext(gis);

  if (!context) {
    return null;
  }

  const actions = getMapAwareActions(context);

  return (
    <section className="ai-map-context-card" aria-label="地图感知">
      <div className="ai-map-context-header">
        <Sparkles size={14} />
        <span>地图感知</span>
      </div>
      <div className="ai-map-context-summary" title={context.layerName}>
        <strong>当前选中</strong>
        <span>{context.layerName} · {context.selectedCount} 个{context.geometryLabel}要素</span>
      </div>
      <div className="ai-map-context-meta">
        <span>{context.fieldCount} 字段</span>
        <span>{context.numericFieldCount} 数值字段</span>
        <span>{context.totalLayerCount} 图层</span>
        {context.hasRaster ? <span>有栅格</span> : null}
      </div>
      <div className="ai-map-context-actions">
        {actions.map((action) => (
          <ThreadPrimitive.Suggestion
            className="ai-context-action"
            key={action.label}
            method="replace"
            prompt={action.prompt}
          >
            {action.label}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </section>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="ai-message ai-message-user">
      <div className="ai-avatar ai-user-avatar" aria-hidden="true">
        <User size={13} />
      </div>
      <div className="ai-bubble ai-user-bubble">
        <MessagePrimitive.Content components={{ Text: TextPart }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="ai-message ai-message-assistant">
      <div className="ai-avatar ai-assistant-avatar" aria-hidden="true">
        <Bot size={13} />
      </div>
      <div className="ai-bubble ai-assistant-bubble">
        <MessagePrimitive.Content components={{ Text: TextPart }} />
        <MessagePrimitive.Error>
          <div className="ai-message-error">请求失败，请检查代理地址或 Direct 模式的 API Key。</div>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  );
}

function TextPart() {
  const part = useMessagePartText();
  const text = part?.text ?? '';

  return (
    <div className="ai-text-part">
      {text.split('\n').map((line, index) => (
        <p className="ai-text-line" key={index}>
          {line || '\u00a0'}
        </p>
      ))}
    </div>
  );
}

function Composer() {
  const { layer } = useGis();
  const placeholder = layer ? `询问 ${layer.fileName}` : '询问地图、图层或分析问题...';

  return (
    <ComposerPrimitive.Root className="ai-composer-root">
      <ComposerPrimitive.Input
        className="ai-composer-input"
        placeholder={placeholder}
        rows={1}
        submitMode="enter"
      />
      <div className="ai-composer-actions">
        <ComposerPrimitive.Cancel className="ai-icon-button" title="停止生成">
          <CircleStop size={16} />
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send className="ai-icon-button ai-send-button" title="发送">
          <SendHorizontal size={16} />
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}

type SelectedMapContext = {
  fieldCount: number;
  geometryLabel: string;
  hasOtherVectorLayers: boolean;
  hasRaster: boolean;
  hasVectorOverlay: boolean;
  layerName: string;
  numericFieldCount: number;
  selectedCount: number;
  totalLayerCount: number;
};

function getSelectedMapContext(gis: GisRuntime): SelectedMapContext | null {
  const layer = gis.layer;

  if (!layer || layer.selectedFeatureIndexes.length === 0) {
    return null;
  }

  const geometryTypes = layer.selectedFeatureIndexes
    .map((index) => getFeatureGeometryType(layer.geojson.features[index]))
    .filter(Boolean);

  return {
    fieldCount: layer.fields.length,
    geometryLabel: formatGeometryLabel(geometryTypes),
    hasOtherVectorLayers: gis.layers.some((item) => item.id !== layer.id),
    hasRaster: Boolean(gis.raster),
    hasVectorOverlay: Boolean(gis.vectorOverlay),
    layerName: layer.fileName,
    numericFieldCount: layer.numericFields.length,
    selectedCount: layer.selectedFeatureIndexes.length,
    totalLayerCount: gis.layers.length,
  };
}

function getMapAwareActions(context: SelectedMapContext) {
  const actions = [
    {
      label: '分析建议',
      prompt: `请基于当前选中的 ${context.selectedCount} 个${context.geometryLabel}要素，结合当前图层和系统已有GIS工具，给出最值得做的分析建议，并说明推荐理由。`,
    },
  ];

  if (context.fieldCount > 0) {
    actions.push({
      label: '查看属性',
      prompt: '请概括当前选中要素的属性信息，优先列出最有代表性的字段和值，并指出哪些字段适合继续分析。',
    });
  }

  actions.push({
    label: '缓冲区',
    prompt: '请帮我为当前选中要素所在图层设置缓冲区分析参数。请先建议一个合理距离，并说明当前缓冲区工具会对活动图层执行。',
  });

  if (context.hasOtherVectorLayers || context.hasVectorOverlay) {
    actions.push({
      label: '按位置选择',
      prompt: '请基于当前选中要素，帮我判断是否适合做按位置选择，并给出目标图层、参考图层和空间关系的参数建议。',
    });
  }

  if (context.hasRaster) {
    actions.push({
      label: '地形分析',
      prompt: '请结合当前选中区域和已加载栅格，判断是否适合做坡度、坡向或山体阴影分析，并给出参数建议。',
    });
  }

  return actions.slice(0, 5);
}

function formatGeometryLabel(geometryTypes: string[]) {
  const uniqueTypes = [...new Set(geometryTypes)];

  if (uniqueTypes.length === 0) {
    return '';
  }

  if (uniqueTypes.length > 1) {
    return '混合';
  }

  const type = uniqueTypes[0];

  if (type === 'Point' || type === 'MultiPoint') {
    return '点';
  }

  if (type === 'LineString' || type === 'MultiLineString') {
    return '线';
  }

  if (type === 'Polygon' || type === 'MultiPolygon') {
    return '面';
  }

  return type;
}

function getFeatureGeometryType(feature: unknown) {
  if (!isPlainObject(feature) || !isPlainObject(feature.geometry) || typeof feature.geometry.type !== 'string') {
    return '';
  }

  return feature.geometry.type;
}

function getFeaturePropertiesPreview(feature: unknown) {
  if (!isPlainObject(feature) || !isPlainObject(feature.properties)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(feature.properties)
      .slice(0, 12)
      .map(([key, value]) => [key, previewPropertyValue(value)]),
  );
}

function previewPropertyValue(value: unknown) {
  if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }

  try {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  } catch {
    return String(value);
  }
}

function AiInlineSettings({
  apiKey,
  compact = false,
  mode,
  model,
  onApiKeyChange,
  onModeChange,
  onModelChange,
  onRememberKeyChange,
  rememberKey,
}: {
  apiKey: string;
  compact?: boolean;
  mode: ChatMode;
  model: string;
  onApiKeyChange: (value: string) => void;
  onModeChange: (value: ChatMode) => void;
  onModelChange: (value: string) => void;
  onRememberKeyChange: (value: boolean) => void;
  rememberKey: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const preventSettingSubmit = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  };
  const CurrentModeIcon = mode === 'proxy' ? Server : Globe2;

  return (
    <div className={`ai-inline-settings ${compact ? 'is-compact' : ''}`}>
      <button
        className={`ai-settings-trigger ${settingsOpen ? 'is-selected' : ''}`}
        type="button"
        title={mode === 'proxy' ? '后端代理' : '浏览器直连'}
        aria-label="AI 连接设置"
        aria-expanded={settingsOpen}
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <CurrentModeIcon size={18} />
      </button>
      {settingsOpen ? (
        <div className="ai-settings-popover" onPointerDown={(event) => event.stopPropagation()}>
          <div className="ai-mode-toggle" aria-label="AI 调用方式">
            <button
              className={mode === 'proxy' ? 'is-selected' : ''}
              type="button"
              title="后端代理"
              aria-label="后端代理"
              onClick={() => onModeChange('proxy')}
            >
              <Server size={14} />
            </button>
            <button
              className={mode === 'direct' ? 'is-selected' : ''}
              type="button"
              title="浏览器直连"
              aria-label="浏览器直连"
              onClick={() => onModeChange('direct')}
            >
              <Globe2 size={14} />
            </button>
          </div>
          {mode === 'direct' ? (
            <>
              <input
                autoComplete="off"
                aria-label="DeepSeek API Key"
                className="ai-inline-key-input"
                placeholder="DeepSeek API Key"
                type="password"
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                onKeyDown={preventSettingSubmit}
              />
              <select
                aria-label="AI model"
                className="ai-inline-model-select"
                value={model}
                onChange={(event) => onModelChange(event.target.value)}
                onKeyDown={preventSettingSubmit}
              >
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="deepseek-reasoner">deepseek-reasoner</option>
              </select>
              <button
                className={`ai-remember-button ${rememberKey ? 'is-selected' : ''}`}
                type="button"
                title="本机保存 Key"
                aria-label="本机保存 Key"
                onClick={() => onRememberKeyChange(!rememberKey)}
              >
                <KeyRound size={14} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

class DeepSeekBrowserTransport implements ChatTransport<UIMessage> {
  private executeGisTool: (name: string, input: Record<string, unknown>) => Promise<AgentToolResult>;
  private getGisContext: () => Record<string, unknown>;
  private getApiKey: () => string;
  private getModel: () => string;
  private system: string;

  constructor({
    executeGisTool,
    getGisContext,
    getApiKey,
    getModel,
    system,
  }: {
    executeGisTool: (name: string, input: Record<string, unknown>) => Promise<AgentToolResult>;
    getGisContext: () => Record<string, unknown>;
    getApiKey: () => string;
    getModel: () => string;
    system: string;
  }) {
    this.executeGisTool = executeGisTool;
    this.getGisContext = getGisContext;
    this.getApiKey = getApiKey;
    this.getModel = getModel;
    this.system = system;
  }

  async sendMessages({
    abortSignal,
    messages,
  }: {
    abortSignal: AbortSignal | undefined;
    messages: UIMessage[];
  }) {
    const apiKey = this.getApiKey().trim();

    return this.sendAgentMessages(apiKey, messages, abortSignal);
  }

  async reconnectToStream() {
    return null;
  }

  private async sendAgentMessages(
    apiKey: string,
    messages: UIMessage[],
    abortSignal: AbortSignal | undefined,
  ) {
    if (!apiKey) {
      throw new Error('Please enter a DeepSeek API Key first.');
    }

    const conversation: DeepSeekChatMessage[] = [
      {
        role: 'system',
        content: `${this.system}\n\nCurrent CTEarth GIS context:\n${JSON.stringify(this.getGisContext(), null, 2)}`,
      },
      ...toDeepSeekMessages(messages),
    ];
    let finalText = '';

    for (let turn = 0; turn < 4; turn += 1) {
      const message = await this.complete(apiKey, conversation, abortSignal);
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      if (toolCalls.length === 0) {
        finalText = typeof message.content === 'string' ? message.content.trim() : '';
        break;
      }

      conversation.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const result = await this.executeGisTool(
          toolCall.function.name,
          parseToolArguments(toolCall.function.arguments),
        );

        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    return textToUIMessageStream(finalText || '工具流程已结束，但模型没有返回最终说明。请查看地图状态确认结果。');
  }

  private async complete(
    apiKey: string,
    messages: DeepSeekChatMessage[],
    abortSignal: AbortSignal | undefined,
  ): Promise<DeepSeekChatMessage> {
    const response = await fetch(DIRECT_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.getModel(),
        messages,
        tools: gisTools,
        tool_choice: 'auto',
        stream: false,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: DeepSeekChatMessage }>;
    };
    const message = payload.choices?.[0]?.message;

    if (!message) {
      throw new Error('DeepSeek response did not include a message.');
    }

    return message;
  }
}

function summarizeGisContext(gis: GisRuntime) {
  return {
    toolsReady: gis.toolsReady,
    isRunning: gis.isRunning,
    message: gis.message,
    activeLayerId: gis.layer?.id ?? null,
    activeLayerName: gis.layer?.fileName ?? null,
    layers: gis.layers.map((layer) => ({
      id: layer.id,
      fileName: layer.fileName,
      featureCount: layer.geojson.features.length,
      pointCount: layer.points.features.length,
      fields: layer.fields,
      numericFields: layer.numericFields,
      selectedField: layer.selectedField,
      selectedFeatureCount: layer.selectedFeatureIndexes.length,
      selectedFeatureIndexes: layer.selectedFeatureIndexes,
      selectedFeatures: layer.selectedFeatureIndexes.slice(0, 5).flatMap((featureIndex) => {
        const feature = layer.geojson.features[featureIndex];

        if (!feature) {
          return [];
        }

        return [{
          featureIndex,
          geometryType: getFeatureGeometryType(feature),
          properties: getFeaturePropertiesPreview(feature),
        }];
      }),
      visible: gis.uploadedLayerVisibility[layer.id] ?? true,
    })),
    outputs: {
      raster: gis.raster ? {
        name: gis.raster.name,
        width: gis.raster.width,
        height: gis.raster.height,
        min: gis.raster.min,
        max: gis.raster.max,
        epsg: gis.raster.epsg ?? null,
        visible: gis.layerVisibility.raster,
      } : null,
      vectorOverlay: gis.vectorOverlay ? {
        id: 'vectorOverlay',
        name: gis.vectorOverlay.name,
        featureCount: gis.vectorOverlay.geojson.features.length,
        visible: gis.layerVisibility.vectorOverlay,
      } : null,
    },
  };
}

async function executeBrowserGisTool(
  name: string,
  input: Record<string, unknown>,
  gisRef: { current: GisRuntime },
): Promise<AgentToolResult> {
  const gis = gisRef.current;

  if (name === 'list_layers') {
    return successToolResult(name, 'Read current CTEarth GIS state.', [
      'GIS state was read from the browser runtime',
    ], summarizeGisContext(gis));
  }

  if (name === 'buffer_vector') {
    return runAgentBuffer(input, gisRef);
  }

  if (name === 'select_by_value') {
    return runAgentSelectByValue(input, gisRef);
  }

  if (name === 'select_by_location') {
    return runAgentSelectByLocation(input, gisRef);
  }

  if (name === 'hillshade' || name === 'slope' || name === 'aspect') {
    return runAgentTerrain(name, input, gisRef);
  }

  if (name === 'idw_interpolation') {
    return runAgentIdw(input, gisRef);
  }

  return failedToolResult(name, `Unknown GIS tool: ${name}`, [
    'Tool name is registered: no',
  ]);
}

async function runAgentSelectByValue(
  input: Record<string, unknown>,
  gisRef: { current: GisRuntime },
): Promise<AgentToolResult> {
  const gis = gisRef.current;

  if (!gis.layer) {
    return blockedToolResult('select_by_value', 'No active vector layer is available. Please upload or select a layer first.', [
      'Active input layer exists: no',
    ]);
  }

  const field = stringArg(input.field, '');

  if (!field || !gis.layer.fields.includes(field)) {
    return blockedToolResult('select_by_value', `Field "${field}" is not available on the active layer.`, [
      'Requested field exists on active layer: no',
    ], {
      fields: gis.layer.fields,
    });
  }

  const params: SelectByValueParameters = {
    field,
    operator: enumArg<SelectByValueOperator>(
      input.operator,
      ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'isEmpty', 'isNotEmpty'],
      'equals',
    ),
    value: stringArg(input.value, ''),
    caseSensitive: booleanArg(input.caseSensitive, false),
    selectionMode: enumArg<SelectionMode>(input.selectionMode, ['new', 'add', 'remove', 'subset'], 'new'),
  };
  const result = await gis.selectByValue(params);
  await waitForUiState();

  if (!result) {
    return failedToolResult('select_by_value', gisRef.current.message || 'Select by value did not complete.', [
      'Selection function returned a result: no',
    ]);
  }

  return successToolResult('select_by_value', `Selected ${result.selectedCount} of ${result.totalCount} feature(s).`, [
    'Selection function returned a result: yes',
    `Matched feature count: ${result.matchedCount}`,
    `Current selection count: ${result.selectedCount}`,
  ], {
    ...result,
    parameters: params,
  });
}

async function runAgentSelectByLocation(
  input: Record<string, unknown>,
  gisRef: { current: GisRuntime },
): Promise<AgentToolResult> {
  const gis = gisRef.current;

  if (!gis.layer) {
    return blockedToolResult('select_by_location', 'No active target layer is available. Please upload or select a layer first.', [
      'Active target layer exists: no',
    ]);
  }

  const referenceLayerId = stringArg(input.referenceLayerId, '');

  if (!referenceLayerId) {
    return blockedToolResult('select_by_location', 'A referenceLayerId is required. Use list_layers to inspect available layer ids.', [
      'Reference layer id is present: no',
    ]);
  }

  const referenceExists = referenceLayerId === 'vectorOverlay'
    ? Boolean(gis.vectorOverlay)
    : gis.layers.some((layer) => layer.id === referenceLayerId);

  if (!referenceExists) {
    return blockedToolResult('select_by_location', `Reference layer "${referenceLayerId}" is not available.`, [
      'Reference layer exists: no',
    ], summarizeGisContext(gis));
  }

  const params: SelectByLocationParameters = {
    referenceLayerId,
    relation: enumArg<SelectByLocationRelation>(input.relation, ['intersects', 'within', 'contains', 'disjoint'], 'intersects'),
    selectionMode: enumArg<SelectionMode>(input.selectionMode, ['new', 'add', 'remove', 'subset'], 'new'),
  };
  const result = await gis.selectByLocation(params);
  await waitForUiState();

  if (!result) {
    return failedToolResult('select_by_location', gisRef.current.message || 'Select by location did not complete.', [
      'Selection function returned a result: no',
    ]);
  }

  return successToolResult('select_by_location', `Selected ${result.selectedCount} of ${result.totalCount} feature(s).`, [
    'Selection function returned a result: yes',
    `Matched feature count: ${result.matchedCount}`,
    `Current selection count: ${result.selectedCount}`,
  ], {
    ...result,
    parameters: params,
  });
}

async function runAgentTerrain(
  tool: TerrainToolId,
  input: Record<string, unknown>,
  gisRef: { current: GisRuntime },
): Promise<AgentToolResult> {
  const gis = gisRef.current;

  if (!gis.toolsReady) {
    return blockedToolResult(tool, 'WASM tools are still loading.', [
      'WASM tool runtime is ready: no',
    ]);
  }

  if (!gis.raster) {
    return blockedToolResult(tool, 'No DEM raster is available. Please add a GeoTIFF first.', [
      'Current raster exists: no',
    ]);
  }

  const beforeRaster = gis.raster;
  const params: TerrainParameters = {
    outputName: stringArg(input.outputName, `${tool}.tif`),
    zFactor: String(positiveNumberArg(input.zFactor, 1)),
    altitude: String(boundedNumberArg(input.altitude, 45, 0, 90)),
    azimuth: String(boundedNumberArg(input.azimuth, 315, 0, 360)),
    units: enumArg<SlopeUnits>(input.units, ['degrees', 'radians', 'percent'], 'degrees'),
  };

  await gis.runTerrainAnalysis(tool, params);
  await waitForUiState();

  const nextGis = gisRef.current;
  const raster = nextGis.raster;
  const changed = Boolean(raster && raster !== beforeRaster);

  if (!changed || !raster) {
    return failedToolResult(tool, nextGis.message || `${tool} finished without a visible raster output.`, [
      'Tool execution promise resolved',
      `Raster overlay changed: ${changed ? 'yes' : 'no'}`,
      'Raster output exists: no',
    ]);
  }

  return successToolResult(tool, `${tool} completed: ${raster.width} x ${raster.height}.`, [
    'Tool execution promise resolved',
    'Raster overlay changed: yes',
    `Raster layer visibility enabled: ${nextGis.layerVisibility.raster ? 'yes' : 'no'}`,
    'Raster dimensions are valid: yes',
  ], {
    outputName: raster.name,
    width: raster.width,
    height: raster.height,
    min: raster.min,
    max: raster.max,
    epsg: raster.epsg ?? null,
    sourceRasterName: beforeRaster.name,
    parameters: params,
  });
}

async function runAgentBuffer(
  input: Record<string, unknown>,
  gisRef: { current: GisRuntime },
): Promise<AgentToolResult> {
  const gis = gisRef.current;
  const distance = numberArg(input.distance);

  if (!gis.toolsReady) {
    return blockedToolResult('buffer_vector', 'WASM tools are still loading.', [
      'WASM tool runtime is ready: no',
    ]);
  }

  if (!gis.layer) {
    return blockedToolResult('buffer_vector', 'No active vector layer is available. Please upload or select a layer first.', [
      'Active input layer exists: no',
    ]);
  }

  if (!Number.isFinite(distance) || distance <= 0) {
    return blockedToolResult('buffer_vector', 'A positive buffer distance is required.', [
      'Positive distance parameter is present: no',
    ]);
  }

  const beforeOverlay = gis.vectorOverlay;
  const params: BufferParameters = {
    outputName: stringArg(input.outputName, 'agent-buffer.geojson'),
    distance: String(distance),
    quadrantSegments: String(integerArg(input.quadrantSegments, 8)),
    capStyle: enumArg(input.capStyle, ['round', 'flat', 'square'], 'round'),
    joinStyle: enumArg(input.joinStyle, ['round', 'bevel', 'mitre'], 'round'),
    dissolve: booleanArg(input.dissolve, false),
  };

  await gis.runBufferAnalysis(params);
  await waitForUiState();

  const nextGis = gisRef.current;
  const overlay = nextGis.vectorOverlay;
  const changed = Boolean(overlay && overlay !== beforeOverlay);
  const featureCount = overlay?.geojson.features.length ?? 0;

  if (!changed || featureCount < 1) {
    return failedToolResult('buffer_vector', nextGis.message || 'Buffer finished without a visible output overlay.', [
      'Tool execution promise resolved',
      `Vector overlay changed: ${changed ? 'yes' : 'no'}`,
      `Output feature count > 0: ${featureCount > 0 ? 'yes' : 'no'}`,
    ]);
  }

  return successToolResult('buffer_vector', `Buffer completed: ${featureCount} feature(s).`, [
    'Tool execution promise resolved',
    'Vector overlay changed: yes',
    'Output feature count > 0: yes',
    `Vector overlay visibility enabled: ${nextGis.layerVisibility.vectorOverlay ? 'yes' : 'no'}`,
  ], {
    outputName: overlay?.name ?? params.outputName,
    featureCount,
    sourceLayerId: gis.layer.id,
    sourceLayerName: gis.layer.fileName,
    parameters: params,
  });
}

async function runAgentIdw(
  input: Record<string, unknown>,
  gisRef: { current: GisRuntime },
): Promise<AgentToolResult> {
  const gis = gisRef.current;

  if (!gis.toolsReady) {
    return blockedToolResult('idw_interpolation', 'WASM tools are still loading.', [
      'WASM tool runtime is ready: no',
    ]);
  }

  if (!gis.layer) {
    return blockedToolResult('idw_interpolation', 'No active point layer is available. Please upload or select a point layer first.', [
      'Active input layer exists: no',
    ]);
  }

  if (gis.layer.points.features.length < 1) {
    return blockedToolResult('idw_interpolation', 'The active layer has no point features for IDW.', [
      'Active layer contains point features: no',
    ]);
  }

  if (gis.layer.numericFields.length < 1) {
    return blockedToolResult('idw_interpolation', 'The active layer has no numeric field for IDW.', [
      'Active layer has numeric fields: no',
    ]);
  }

  const field = stringArg(input.field, gis.layer.selectedField || gis.layer.numericFields[0]);

  if (!gis.layer.numericFields.includes(field)) {
    return blockedToolResult('idw_interpolation', `Field "${field}" is not a numeric field on the active layer.`, [
      'Requested field exists in numeric fields: no',
    ], {
      numericFields: gis.layer.numericFields,
    });
  }

  const cellSize = numberArg(input.cellSize);
  const params: IdwParameters = {
    field,
    outputName: stringArg(input.outputName, 'agent-idw.tif'),
    cellSize: Number.isFinite(cellSize) && cellSize > 0 ? String(cellSize) : '0.001',
    weight: String(positiveNumberArg(input.weight, 2)),
    radius: String(nonNegativeNumberArg(input.radius, 0)),
    minPoints: String(Math.max(0, integerArg(input.minPoints, 0))),
  };
  const beforeRaster = gis.raster;

  await gis.runIdwInterpolation(params);
  await waitForUiState();

  const nextGis = gisRef.current;
  const raster = nextGis.raster;
  const changed = Boolean(raster && raster !== beforeRaster);

  if (!changed || !raster) {
    return failedToolResult('idw_interpolation', nextGis.message || 'IDW finished without a visible raster output.', [
      'Tool execution promise resolved',
      `Raster overlay changed: ${changed ? 'yes' : 'no'}`,
      'Raster output exists: no',
    ]);
  }

  return successToolResult('idw_interpolation', `IDW completed: ${raster.width} x ${raster.height}.`, [
    'Tool execution promise resolved',
    'Raster overlay changed: yes',
    `Raster layer visibility enabled: ${nextGis.layerVisibility.raster ? 'yes' : 'no'}`,
    'Raster dimensions are valid: yes',
  ], {
    width: raster.width,
    height: raster.height,
    min: raster.min,
    max: raster.max,
    epsg: raster.epsg ?? null,
    sourceLayerId: gis.layer.id,
    sourceLayerName: gis.layer.fileName,
    parameters: params,
  });
}

function successToolResult(
  tool: string,
  message: string,
  checks: string[],
  output?: Record<string, unknown>,
): AgentToolResult {
  return {
    ok: true,
    status: 'success',
    tool,
    message,
    qa: {
      passed: true,
      checks,
    },
    output,
  };
}

function blockedToolResult(
  tool: string,
  message: string,
  checks: string[],
  output?: Record<string, unknown>,
): AgentToolResult {
  return {
    ok: false,
    status: 'blocked',
    tool,
    message,
    qa: {
      passed: false,
      checks,
    },
    output,
  };
}

function failedToolResult(tool: string, message: string, checks: string[]): AgentToolResult {
  return {
    ok: false,
    status: 'failed',
    tool,
    message,
    qa: {
      passed: false,
      checks,
    },
  };
}

function parseToolArguments(value: string) {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stringArg(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberArg(value: unknown) {
  return typeof value === 'number' ? value : Number(value);
}

function positiveNumberArg(value: unknown, fallback: number) {
  const number = numberArg(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumberArg(value: unknown, fallback: number) {
  const number = numberArg(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function boundedNumberArg(value: unknown, fallback: number, min: number, max: number) {
  const number = numberArg(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function integerArg(value: unknown, fallback: number) {
  const number = numberArg(value);
  return Number.isInteger(number) ? number : fallback;
}

function booleanArg(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function enumArg<T extends string>(value: unknown, options: T[], fallback: T) {
  return options.includes(value as T) ? value as T : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function waitForUiState() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function textToUIMessageStream(text: string) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'start' } as UIMessageChunk);
      controller.enqueue({ type: 'start-step' } as UIMessageChunk);
      controller.enqueue({ type: 'text-start', id: 'text-1' } as UIMessageChunk);
      controller.enqueue({ type: 'text-delta', id: 'text-1', delta: text } as UIMessageChunk);
      controller.enqueue({ type: 'text-end', id: 'text-1' } as UIMessageChunk);
      controller.enqueue({ type: 'finish-step' } as UIMessageChunk);
      controller.enqueue({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
      controller.close();
    },
  });
}

function toDeepSeekMessages(messages: UIMessage[]) {
  return messages
    .map((message) => {
      const content = getMessageText(message);

      if (!content || (message.role !== 'assistant' && message.role !== 'user')) {
        return null;
      }

      return {
        role: message.role,
        content,
      };
    })
    .filter((message): message is { role: 'assistant' | 'user'; content: string } => Boolean(message));
}

function getMessageText(message: UIMessage) {
  const legacyMessage = message as { content?: unknown };

  if (typeof legacyMessage.content === 'string') {
    return legacyMessage.content;
  }

  if (!Array.isArray(message.parts)) {
    return '';
  }

  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function deepSeekSseToUIMessageStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let textStarted = false;
  let closed = false;

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: 'start' } as UIMessageChunk);
      controller.enqueue({ type: 'start-step' } as UIMessageChunk);

      try {
        while (!closed) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const data = parseSseData(line);

            if (!data) {
              continue;
            }

            if (data === '[DONE]') {
              closed = true;
              break;
            }

            const delta = getDeepSeekDelta(data);

            if (delta) {
              if (!textStarted) {
                controller.enqueue({ type: 'text-start', id: 'text-1' } as UIMessageChunk);
                textStarted = true;
              }

              controller.enqueue({
                type: 'text-delta',
                id: 'text-1',
                delta,
              } as UIMessageChunk);
            }
          }
        }

        if (textStarted) {
          controller.enqueue({ type: 'text-end', id: 'text-1' } as UIMessageChunk);
        }

        controller.enqueue({ type: 'finish-step' } as UIMessageChunk);
        controller.enqueue({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      closed = true;
      return reader.cancel();
    },
  });
}

function parseSseData(line: string) {
  const trimmed = line.trim();

  if (!trimmed.startsWith('data:')) {
    return null;
  }

  return trimmed.slice(5).trim();
}

function getDeepSeekDelta(data: string) {
  try {
    const payload = JSON.parse(data) as {
      choices?: { delta?: { content?: string } }[];
    };

    return payload.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}
