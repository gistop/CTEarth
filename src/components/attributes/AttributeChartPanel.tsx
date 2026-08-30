import { useEffect, useMemo, useRef, useState } from 'react';
import { type IDockviewPanelProps } from 'dockview-react';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartColumn } from 'lucide-react';
import { displayLayerName, useGis, type GeoJsonFeatureCollection } from '../../gisStore';
import { useAttributeTable } from './AttributeTableContext';

use([
  BarChart,
  PieChart,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
]);

type AttributeChartPanelParams = {
  layerId?: string;
  field?: string;
};

type ChartKind = 'distribution' | 'bar' | 'pie';

type AttributeChartRow = {
  properties: Record<string, unknown>;
};

type AttributeLayer = {
  id: string;
  fileName: string;
  geojson: GeoJsonFeatureCollection;
  fields: string[];
  selectedFeatureIndexes: number[];
};

export function AttributeChartPanel({ params }: IDockviewPanelProps<AttributeChartPanelParams>) {
  const layerId = params.layerId ?? null;
  const { layers, vectorOverlay } = useGis();
  const { getTableState } = useAttributeTable();
  const tableState = getTableState(layerId);
  const chartElementRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const vectorOverlayLayer = useMemo<AttributeLayer | null>(() => (
    layerId === 'vectorOverlay' && vectorOverlay ? {
      id: 'vectorOverlay',
      fileName: vectorOverlay.name,
      geojson: vectorOverlay.geojson,
      fields: getFields(vectorOverlay.geojson.features),
      selectedFeatureIndexes: [],
    } : null
  ), [layerId, vectorOverlay]);
  const layer = useMemo<AttributeLayer | null>(
    () => layers.find((item) => item.id === layerId) ?? vectorOverlayLayer,
    [layerId, layers, vectorOverlayLayer],
  );
  const fields = layer?.fields ?? [];
  const defaultField = useMemo(
    () => chooseDefaultField(layer, params.field),
    [layer, params.field],
  );
  const [field, setField] = useState(defaultField);
  const [chartKind, setChartKind] = useState<ChartKind>('distribution');
  const selectedIndexes = useMemo(() => new Set(layer?.selectedFeatureIndexes ?? []), [layer]);
  const rows = useMemo(
    () => buildRows(layer, tableState.query, tableState.showSelectedOnly, selectedIndexes),
    [layer, selectedIndexes, tableState.query, tableState.showSelectedOnly],
  );
  const chartModel = useMemo(
    () => buildChartModel(rows, field, chartKind),
    [chartKind, field, rows],
  );

  useEffect(() => {
    if (params.field && fields.includes(params.field)) {
      setField(params.field);
    }
  }, [fields, params.field]);

  useEffect(() => {
    if (!defaultField || fields.includes(field)) {
      return;
    }

    setField(defaultField);
  }, [defaultField, field, fields]);

  useEffect(() => {
    if (!chartElementRef.current) {
      return undefined;
    }

    const chart = init(chartElementRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(chartElementRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    if (!chartModel.option) {
      chart.clear();
      return;
    }

    chart.setOption(chartModel.option, true);
    chart.resize();
  }, [chartModel.option]);

  if (!layer) {
    return (
      <section className="attribute-chart-panel attribute-chart-empty">
        <ChartColumn size={22} />
        <span>请选择矢量图层后生成图表</span>
      </section>
    );
  }

  return (
    <section className="attribute-chart-panel" aria-label={`${displayLayerName(layer.fileName)} 属性统计图`}>
      <header className="attribute-chart-toolbar">
        <label>
          <span>字段</span>
          <select value={field} onChange={(event) => setField(event.target.value)}>
            {fields.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>图表</span>
          <select value={chartKind} onChange={(event) => setChartKind(event.target.value as ChartKind)}>
            <option value="distribution">分布图</option>
            <option value="bar">柱状图</option>
            <option value="pie">饼图</option>
          </select>
        </label>
        <div className="attribute-chart-summary">
          <span>{rows.length} 行</span>
          <span>{chartModel.summary}</span>
        </div>
      </header>
      <div className="attribute-chart-body">
        <div className="attribute-chart-canvas" ref={chartElementRef} />
        {!chartModel.option ? (
          <div className="attribute-chart-no-data">
            <ChartColumn size={22} />
            <span>{chartModel.summary}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function chooseDefaultField(layer: AttributeLayer | null, preferredField?: string) {
  if (!layer) {
    return '';
  }

  if (preferredField && layer.fields.includes(preferredField)) {
    return preferredField;
  }

  const numericField = layer.fields.find((field) => {
    const values = layer.geojson.features
      .slice(0, 80)
      .map((feature) => getAttributeValue(feature, field))
      .filter((value) => value !== undefined && value !== null && value !== '');

    return values.length > 0 && values.every((value) => Number.isFinite(Number(value)));
  });

  return numericField ?? layer.fields[0] ?? '';
}

function buildRows(
  layer: AttributeLayer | null,
  query: string,
  showSelectedOnly: boolean,
  selectedIndexes: Set<number>,
) {
  if (!layer) {
    return [];
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();

  return layer.geojson.features.flatMap((feature, featureIndex) => {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};

    if (showSelectedOnly && !selectedIndexes.has(featureIndex)) {
      return [];
    }

    if (normalizedQuery && !rowMatchesQuery(properties, normalizedQuery)) {
      return [];
    }

    return [{ properties }];
  });
}

function buildChartModel(rows: AttributeChartRow[], field: string, chartKind: ChartKind): {
  option: EChartsCoreOption | null;
  summary: string;
} {
  if (!field) {
    return { option: null, summary: '没有可统计字段' };
  }

  const values = rows
    .map((row) => row.properties[field])
    .filter((value) => value !== undefined && value !== null && value !== '');

  if (values.length === 0) {
    return { option: null, summary: '当前筛选没有可统计值' };
  }

  const numericValues = values.map((value) => Number(value)).filter(Number.isFinite);
  const isNumeric = numericValues.length > 0 && numericValues.length / values.length >= 0.8;

  if (chartKind === 'distribution' && isNumeric) {
    return buildHistogramOption(field, numericValues);
  }

  const categories = buildCategoryCounts(values, chartKind === 'pie' ? 12 : 30);

  if (categories.length === 0) {
    return { option: null, summary: '当前字段没有可统计分类' };
  }

  if (chartKind === 'pie') {
    return buildPieOption(field, categories);
  }

  return buildBarOption(field, categories, chartKind === 'distribution' ? '分布图' : '柱状图');
}

function buildHistogramOption(field: string, values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = min === max ? 1 : Math.min(24, Math.max(6, Math.ceil(Math.sqrt(values.length))));
  const step = min === max ? 1 : (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    label: min === max
      ? formatNumber(min)
      : `${formatNumber(min + index * step)} - ${formatNumber(min + (index + 1) * step)}`,
    count: 0,
  }));

  values.forEach((value) => {
    const index = min === max ? 0 : Math.min(binCount - 1, Math.floor((value - min) / step));
    bins[index].count += 1;
  });

  return {
    option: makeCartesianOption({
      title: `${field} 分布`,
      xData: bins.map((bin) => bin.label),
      yData: bins.map((bin) => bin.count),
      seriesName: '要素数',
    }),
    summary: `${values.length} 个数值，${bins.length} 个分组`,
  };
}

function buildBarOption(field: string, categories: { name: string; value: number }[], titleSuffix: string) {
  return {
    option: makeCartesianOption({
      title: `${field} ${titleSuffix}`,
      xData: categories.map((item) => item.name),
      yData: categories.map((item) => item.value),
      seriesName: '要素数',
    }),
    summary: `${categories.length} 个分类`,
  };
}

function buildPieOption(field: string, categories: { name: string; value: number }[]) {
  return {
    option: {
      title: {
        text: `${field} 占比`,
        left: 14,
        top: 10,
        textStyle: { fontSize: 13, fontWeight: 650, color: '#263849' },
      },
      tooltip: { trigger: 'item' },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 12,
        top: 42,
        bottom: 16,
      },
      series: [{
        name: '要素数',
        type: 'pie',
        radius: ['34%', '66%'],
        center: ['40%', '56%'],
        data: categories,
      }],
    } satisfies EChartsCoreOption,
    summary: `${categories.length} 个分类`,
  };
}

function makeCartesianOption({
  title,
  xData,
  yData,
  seriesName,
}: {
  title: string;
  xData: string[];
  yData: number[];
  seriesName: string;
}): EChartsCoreOption {
  return {
    title: {
      text: title,
      left: 14,
      top: 10,
      textStyle: { fontSize: 13, fontWeight: 650, color: '#263849' },
    },
    grid: { left: 44, right: 18, top: 58, bottom: xData.length > 12 ? 70 : 42 },
    tooltip: { trigger: 'axis' },
    dataZoom: xData.length > 12 ? [
      { type: 'inside' },
      { type: 'slider', height: 18, bottom: 22 },
    ] : undefined,
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: {
        interval: 0,
        hideOverlap: true,
        overflow: 'truncate',
        width: 86,
      },
    },
    yAxis: { type: 'value', name: seriesName },
    series: [{
      name: seriesName,
      type: 'bar',
      data: yData,
      itemStyle: { color: '#1677b8' },
    }],
  };
}

function buildCategoryCounts(values: unknown[], limit: number) {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const key = formatAttributeValue(value) || '(空值)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const ordered = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, value]) => ({ name, value }));

  if (ordered.length <= limit) {
    return ordered;
  }

  const visible = ordered.slice(0, limit);
  const other = ordered.slice(limit).reduce((sum, item) => sum + item.value, 0);

  return [...visible, { name: '其他', value: other }];
}

function rowMatchesQuery(properties: Record<string, unknown>, query: string) {
  return Object.values(properties).some((value) => (
    formatAttributeValue(value).toLocaleLowerCase().includes(query)
  ));
}

function getAttributeValue(feature: unknown, field: string) {
  if (!isRecord(feature) || !isRecord(feature.properties)) {
    return undefined;
  }

  return feature.properties[field];
}

function formatAttributeValue(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getFields(features: unknown[]) {
  const fields = new Set<string>();

  for (const feature of features) {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};

    Object.keys(properties).forEach((key) => fields.add(key));
  }

  return [...fields].sort();
}
