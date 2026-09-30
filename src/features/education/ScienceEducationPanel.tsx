import { useMemo, useState, type SyntheticEvent } from 'react';
import { Search } from 'lucide-react';
import { useMapCommands } from '../maps/components/map/MapCommandContext';
import { useTeaching } from './TeachingContext';
import {
  LANDFORM_TYPE_LABEL,
  LANDFORM_TYPES,
  TYPICAL_LANDFORMS,
  type Landform,
  type LandformTypeId,
} from './landforms';

type CategoryFilter = LandformTypeId | 'all';

// 科教面板（dockview 左侧第一个 tab）：典型地貌卡片库，
// 点击卡片后由 LandformFlyToBridge 在三维视图中飞往对应视角并显示标注。
export function ScienceEducationPanel() {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { requestLandformFlyTo } = useTeaching();
  const { mapCommandState } = useMapCommands();
  const isGlobeMode = mapCommandState.mapMode === 'globe';

  const filtered = useMemo(() => {
    const text = keyword.trim();

    return TYPICAL_LANDFORMS.filter((landform) => {
      const matchCategory = category === 'all' || landform.type === category;
      const matchKeyword = !text
        || landform.name.includes(text)
        || landform.summary.includes(text)
        || LANDFORM_TYPE_LABEL[landform.type].includes(text);

      return matchCategory && matchKeyword;
    });
  }, [keyword, category]);

  const handleSelect = (landform: Landform) => {
    setSelectedId(landform.id);
    requestLandformFlyTo(landform);
  };

  const hideMissingImage = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.style.display = 'none';
  };

  return (
    <section className="science-education-panel">
      <div className="science-education-toolbar">
        <label className="science-education-search">
          <Search size={14} strokeWidth={1.8} />
          <input
            type="search"
            placeholder="搜索地貌名称或类型"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
        <div className="science-education-chips" role="tablist" aria-label="地貌分类">
          <button
            type="button"
            role="tab"
            aria-selected={category === 'all'}
            className={category === 'all' ? 'is-selected' : ''}
            onClick={() => setCategory('all')}
          >
            全部
          </button>
          {LANDFORM_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              className={category === item.id ? 'is-selected' : ''}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="science-education-list">
        {filtered.map((landform) => (
          <li key={landform.id}>
            <button
              type="button"
              className={selectedId === landform.id ? 'is-selected' : ''}
              onClick={() => handleSelect(landform)}
            >
              {landform.image && (
                <img
                  className="science-education-thumb"
                  src={`/landforms/${landform.image}`}
                  alt=""
                  loading="lazy"
                  onError={hideMissingImage}
                />
              )}
              <span className="science-education-item-head">
                <strong>{landform.name}</strong>
                <span className="science-education-badge">{LANDFORM_TYPE_LABEL[landform.type]}</span>
              </span>
              <span className="science-education-summary">{landform.summary}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="science-education-empty">没有匹配的地貌，换个关键词试试。</li>}
      </ul>
      <footer className="science-education-hint">
        {isGlobeMode
          ? selectedId ? '已定位所选地貌，标注已显示在场景中。' : '点击卡片即可在三维视图飞往该地貌。'
          : '典型地貌观察需切换到三维视图（地图 Tab → 三维）。'}
      </footer>
    </section>
  );
}
