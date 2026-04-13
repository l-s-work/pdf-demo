import styled from 'styled-components';

// 高亮框坐标类型，表示页面中的可视区域矩形。
export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const StyledOverlay = styled.div<ViewportRect>`
  position: absolute;
  left: ${(props) => `${props.left}px`};
  top: ${(props) => `${props.top}px`};
  width: ${(props) => `${props.width}px`};
  height: ${(props) => `${props.height}px`};
  border-radius: 4px;
  background: rgba(255, 204, 0, 0.35);
  border: 1px solid rgba(255, 153, 0, 0.8);
  pointer-events: none;
`;

interface HighlightOverlayProps {
  rect: ViewportRect;
}

// 渲染单个高亮覆盖层。
export default function HighlightOverlay({ rect }: HighlightOverlayProps) {
  return <StyledOverlay {...rect} />;
}
