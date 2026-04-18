import MapPage from '../../pages/MapPage';

// Live mode hosts MapPage stripped of its chrome. Actions, sensor controls,
// offsets, title, and warning have all moved to the right-hand
// LiveControlsPanel, so the satellite fills the full viewport minus a tiny
// breathing margin.

export function MapboxLiveView() {
    return (
        <div className="flex-1 relative bg-slate-950" style={{padding: 4}}>
            <MapPage/>
        </div>
    );
}

export default MapboxLiveView;
