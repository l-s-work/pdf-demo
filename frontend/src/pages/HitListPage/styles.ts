import styled from 'styled-components';

// 列表页最外层容器样式。
export const StyledContainer = styled.div`
  min-height: 100vh;
  padding: 24px;
  background: #f5f7fb;
`;

// 页面头部区域样式。
export const StyledHeader = styled.div`
  margin-bottom: 16px;
`;

// 页面内容堆叠容器。
export const StyledSectionStack = styled.div`
  display: grid;
  gap: 16px;
`;

// 上传区域表单布局。
export const StyledUploadGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(320px, 1fr);
  gap: 16px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

// 上传字段容器样式。
export const StyledUploadField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

// 手工测试项列表样式。
export const StyledManualItemList = styled.div`
  display: grid;
  gap: 12px;
`;

// 单条手工测试项录入行样式。
export const StyledManualItemRow = styled.div`
  display: grid;
  grid-template-columns: 140px minmax(240px, 1fr) auto;
  gap: 12px;
  align-items: center;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

// 原生文件选择输入样式。
export const StyledFileInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px dashed #c8d1e0;
  border-radius: 8px;
  background: #ffffff;
  color: #223046;
`;

// 上传结果区域样式。
export const StyledUploadResult = styled.div`
  display: grid;
  gap: 12px;
`;
