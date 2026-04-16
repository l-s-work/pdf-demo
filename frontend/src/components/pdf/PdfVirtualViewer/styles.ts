import styled from "styled-components";

// Viewer 最外层容器。
export const StyledContainer = styled.div<{ $viewerWidth: number }>`
  position: relative;
  width: ${({ $viewerWidth }) => `${$viewerWidth}px`};
  max-width: 100%;
  margin: 0 auto;
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
  overflow-y: scroll;
  overflow-x: hidden;
  padding: 12px 0;
  scrollbar-gutter: stable;
`;

// 首屏加载遮罩，居中展示加载状态。
export const StyledLoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(250, 250, 250, 0.78);
  backdrop-filter: blur(1px);
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

// 单页占位骨架，用于 PDF 仍在加载时提前展示页面轮廓。
export const StyledPagePlaceholder = styled.div<{
  $pageWidth: number;
  $pageHeight: number;
}>`
  position: absolute;
  inset: 0;
  z-index: 0;
  width: ${({ $pageWidth }) => `${$pageWidth}px`};
  height: ${({ $pageHeight }) => `${$pageHeight}px`};
  border-radius: 4px;
  border: 1px solid rgba(217, 217, 217, 0.9);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 252, 0.96)),
    repeating-linear-gradient(
      135deg,
      rgba(24, 144, 255, 0.05) 0,
      rgba(24, 144, 255, 0.05) 14px,
      rgba(24, 144, 255, 0.02) 14px,
      rgba(24, 144, 255, 0.02) 28px
    );
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c8c8c;
`;

// 单页画布外框。
export const StyledPageFrame = styled.div<{
  $pageWidth: number;
  $pageHeight: number;
}>`
  position: relative;
  width: ${({ $pageWidth }) => `${$pageWidth}px`};
  height: ${({ $pageHeight }) => `${$pageHeight}px`};
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
`;

// 画布样式。
export const StyledCanvas = styled.canvas<{ $isVisible: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transition: opacity 0.16s ease;
`;

// 自定义文本选区容器，替代浏览器默认选区视觉，减少重叠感。
export const StyledSelectionLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
`;

// 单个选区块。
export const StyledSelectionRect = styled.div`
  position: absolute;
  border-radius: 2px;
  background: rgba(24, 144, 255, 0.14);
`;

// 文本层：用于可选中复制，不影响底层 canvas 渲染。
export const StyledTextLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: clip;
  line-height: 1;
  text-align: initial;
  -webkit-text-size-adjust: none;
  -moz-text-size-adjust: none;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  opacity: 1;
  z-index: 1;
  user-select: text;
  pointer-events: auto;

  span,
  br {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
  }

  > :not(.markedContent),
  .markedContent span:not(.markedContent) {
    z-index: 1;
  }

  span.markedContent {
    top: 0;
    height: 0;
  }

  span[role="img"] {
    user-select: none;
    cursor: default;
  }

  ::selection {
    background: transparent;
  }

  ::-moz-selection {
    background: transparent;
  }

  br::selection {
    background: transparent;
  }

  br::-moz-selection {
    background: transparent;
  }

  /* pdf.js 会往文本层里插入测量用的隐藏 canvas，不补这层样式就会露出黑块。 */
  .hiddenCanvasElement {
    display: none !important;
  }
`;
