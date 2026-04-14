import styled from 'styled-components';

// 预览页最外层容器样式。
export const StyledContainer = styled.div`
  min-height: 100vh;
  padding: 16px;
  background: #f5f7fb;
`;

// Viewer 区域样式，独立于头部控制区。
export const StyledViewerWrapper = styled.div`
  position: relative;
  margin-top: 12px;
  height: calc(100vh - 180px);
`;
