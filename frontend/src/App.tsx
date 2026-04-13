import { Navigate, Route, Routes } from 'react-router-dom';
import HitListPage from './pages/HitListPage';
import PdfViewerPage from './pages/PdfViewerPage';

// 应用根路由，定义列表页与预览页。
export default function App() {
  return (
    <Routes>
      <Route path="/hits" element={<HitListPage />} />
      <Route path="/viewer/:pdfId" element={<PdfViewerPage />} />
      <Route path="*" element={<Navigate to="/hits" replace />} />
    </Routes>
  );
}
