import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ChevronDown, Cloud, FolderPlus, Link2 } from 'lucide-react';
import { useGis } from '../../gisStore';

export function AddDataSplitButton() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isSubmittingRemote, setIsSubmittingRemote] = useState(false);
  const {
    uploadCsv,
    uploadGeoJson,
    uploadGeoPackage,
    uploadGeoParquetFile,
    uploadGeoParquetUrl,
    uploadGeoTiff,
    uploadGeoTiffUrl,
    uploadShapefileZip,
  } = useGis();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (isCsvFile(file.name)) {
      await uploadCsv(file);
    } else if (isGeoTiffFile(file.name)) {
      await uploadGeoTiff(file);
    } else if (isGeoJsonFile(file.name)) {
      await uploadGeoJson(file);
    } else if (isGeoParquetFile(file.name)) {
      await uploadGeoParquetFile(file);
    } else if (isGeoPackageFile(file.name)) {
      await uploadGeoPackage(file);
    } else {
      await uploadShapefileZip(file);
    }

    event.target.value = '';
    setIsMenuOpen(false);
  };

  const handleRemoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const url = remoteUrl.trim();

    if (!url) {
      return;
    }

    setIsSubmittingRemote(true);

    try {
      if (isGeoTiffFile(url)) {
        await uploadGeoTiffUrl(url);
      } else {
        await uploadGeoParquetUrl(url);
      }

      setRemoteUrl('');
      setIsMenuOpen(false);
    } finally {
      setIsSubmittingRemote(false);
    }
  };

  return (
    <div
      className="add-data-split"
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setIsMenuOpen(false);
        }
      }}
    >
      <button
        className="add-data-local"
        type="button"
        title="本地添加数据"
        aria-label="本地添加 CSV、Shapefile ZIP、GeoJSON、GeoParquet、GeoPackage 或 GeoTIFF 数据"
        onClick={() => fileInputRef.current?.click()}
      >
        <FolderPlus size={16} />
        <span>本地</span>
      </button>
      <button
        className={isMenuOpen ? 'add-data-toggle is-open' : 'add-data-toggle'}
        type="button"
        title="远程添加 GeoParquet 或 COG/GeoTIFF"
        aria-label="远程添加 GeoParquet 或 COG/GeoTIFF"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <ChevronDown size={14} />
      </button>
      {isMenuOpen ? (
        <form className="add-data-menu" onSubmit={handleRemoteSubmit}>
          <label className="add-data-url-field">
            <span>
              <Link2 size={14} />
              远程
            </span>
            <input
              value={remoteUrl}
              type="url"
              placeholder="https://.../data.geoparquet 或 image.tif"
              aria-label="GeoParquet 或 COG/GeoTIFF 远程地址"
              onChange={(event) => setRemoteUrl(event.target.value)}
            />
          </label>
          <button className="add-data-remote-submit" type="submit" disabled={!remoteUrl.trim() || isSubmittingRemote}>
            <Cloud size={14} />
            <span>{isSubmittingRemote ? '读取中' : '添加'}</span>
          </button>
        </form>
      ) : null}
      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".csv,.zip,.geojson,.json,.parquet,.geoparquet,.gpkg,.geopackage,.tif,.tiff,.geotiff"
        onChange={handleFileChange}
      />
    </div>
  );
}

function isCsvFile(fileName: string) {
  return /\.csv$/i.test(pathNameForExtension(fileName));
}

function isGeoTiffFile(fileName: string) {
  return /\.(tif|tiff|geotiff)$/i.test(pathNameForExtension(fileName));
}

function isGeoJsonFile(fileName: string) {
  return /\.(geojson|json)$/i.test(pathNameForExtension(fileName));
}

function isGeoParquetFile(fileName: string) {
  return /\.(parquet|geoparquet)$/i.test(pathNameForExtension(fileName));
}

function isGeoPackageFile(fileName: string) {
  return /\.(gpkg|geopackage)$/i.test(pathNameForExtension(fileName));
}

function pathNameForExtension(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}
