export type MeasurePoint = {
  height: number;
  lat: number;
  lon: number;
};

export type DistanceKind = 'space' | 'surface';

export type DistanceMeasurementStyle = {
  aboveGroundColor: string;
  aboveGroundWidth: number;
  belowGroundColor: string;
  belowGroundWidth: number;
  crossingColor: string;
  crossingRadius: number;
  dimensionColor: string;
  dimensionWidth: number;
  extensionColor: string;
  extensionWidth: number;
  groundAnchorColor: string;
  groundAnchorRadius: number;
};

export type CompletedDistanceMeasurement = {
  id: string;
  isVisible: boolean;
  name: string;
  points: MeasurePoint[];
  style: DistanceMeasurementStyle;
  totalDistance: number;
};

export const defaultDistanceMeasurementStyle: DistanceMeasurementStyle = {
  aboveGroundColor: '#e58a00',
  aboveGroundWidth: 3,
  belowGroundColor: '#e58a00',
  belowGroundWidth: 2,
  crossingColor: '#ff9f0a',
  crossingRadius: 14,
  dimensionColor: '#46ddff',
  dimensionWidth: 3,
  extensionColor: '#8ceaff',
  extensionWidth: 2,
  groundAnchorColor: '#8ceaff',
  groundAnchorRadius: 10,
};

export function createDefaultDistanceMeasurementStyle(): DistanceMeasurementStyle {
  return { ...defaultDistanceMeasurementStyle };
}
