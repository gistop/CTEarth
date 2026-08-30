import { initTools, runTool, type RunToolOptions, type ToolResult } from 'geolibre-wasm/tools';

type ToolWorkerRequest = {
  id: number;
  tool: string;
  options: RunToolOptions;
};

type ToolWorkerResponse = {
  id: number;
  ok: true;
  result: ToolResult;
} | {
  id: number;
  ok: false;
  message: string;
};

self.addEventListener('message', (event: MessageEvent<ToolWorkerRequest>) => {
  const { id, options, tool } = event.data;

  void runToolInWorker(id, tool, options);
});

async function runToolInWorker(id: number, tool: string, options: RunToolOptions) {
  try {
    await initTools();
    const result = await runTool(tool, options);
    postWorkerMessage({ id, ok: true, result });
  } catch (error) {
    postWorkerMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function postWorkerMessage(message: ToolWorkerResponse) {
  self.postMessage(message);
}
