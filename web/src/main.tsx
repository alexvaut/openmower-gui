// eslint-disable-next-line import/order
import './wdyr';
import React from 'react'
import ReactDOM from 'react-dom/client'
import {createHashRouter, RouterProvider,} from "react-router-dom";
import Root from "./routes/root.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import LogsPage from "./pages/LogsPage.tsx";
import OpenMowerPage from "./pages/OpenMowerPage.tsx";
import MapEditorPage from "./pages/MapEditorPage.tsx";
import SetupPage from "./pages/SetupPage.tsx";
import {App} from "antd";
import {Spinner} from "./components/Spinner.tsx";

const router = createHashRouter([
    {
        path: "/",
        element: <Root/>,
        children: [
            {
                element: <SettingsPage/>,
                path: "/settings",
            },
            {
                element: <LogsPage/>,
                path: "/logs",
            },
            {
                element: <OpenMowerPage/>,
                path: "/openmower",
            },
            {
                element: <MapEditorPage/>,
                path: "/map-editor",
            },
            {
                element: <SetupPage/>,
                path: "/setup",
            }
        ]
    },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
      <App style={{height: "100%"}}>
          <React.Suspense fallback={<Spinner/>}>
              <RouterProvider router={router}/>
          </React.Suspense>
      </App>
  </React.StrictMode>,
)
