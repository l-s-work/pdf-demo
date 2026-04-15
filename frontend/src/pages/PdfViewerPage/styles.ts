import styled from 'styled-components';

// 预览页最外层容器样式。
export const StyledContainer = styled.div`
  height: 100vh;
  box-sizing: border-box;
  padding: 16px;
  background: #f5f7fb;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

// Viewer 区域样式，独立于头部控制区。
export const StyledViewerWrapper = styled.div`
  position: relative;
  margin-top: 12px;
  flex: 1;
  min-height: 0;
`;
