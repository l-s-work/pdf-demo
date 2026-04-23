import { createGlobalStyle } from 'styled-components';

// PDF 文本层测量用隐藏画布可能挂到 body 下，这里使用全局样式统一兜底。
export const GlobalStyle = createGlobalStyle`
  .hiddenCanvasElement {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    display: none;
  }
`;
