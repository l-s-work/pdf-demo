import styled from 'styled-components';

// Viewer 最外层容器。
export const StyledContainer = styled.div`
  height: 100%;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #fafafa;
  overflow: hidden;
`;

// 滚动容器，用于承载虚拟页面列表。
export const StyledScrollContainer = styled.div`
  position: relative;
  height: 100%;
  overflow: auto;
  padding: 12px;
`;

// 单页占位槽位。
export const StyledPageSlot = styled.div`
  position: absolute;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 8px 0;
`;

// 单页画布外框。
export const StyledPageFrame = styled.div`
  position: relative;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
`;

// 画布样式。
export const StyledCanvas = styled.canvas`
  display: block;
`;
