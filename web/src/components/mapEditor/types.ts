export type Point = {x: number; y: number};

export type AreaType = 'mow' | 'obstacle' | 'nav';

export type Area = {
    id: string;
    properties: {type: AreaType};
    outline: Point[];
};

export type Dock = {
    id: string;
    properties: {name: string};
    position: Point;
    heading: number;
};

export type MapDoc = {
    areas: Area[];
    docking_stations: Dock[];
};

export type EdgeHover = {i: number; proj: Point; dist: number};

export type Drag =
    | {kind: 'pan'; startScreen: Point; startView: {cx: number; cy: number}}
    | {kind: 'point'; areaId: string; pointIdx: number}
    | {kind: 'dock-move'; dockId: string}
    | {kind: 'dock-heading'; dockId: string};

export type View = {cx: number; cy: number; zoom: number};

export type Selection = {kind: 'area' | 'dock'; id: string};

export type DrawingState = {type: AreaType; points: Point[]};

export type Snap = 0 | 0.1 | 0.5 | 1;
