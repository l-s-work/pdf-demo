import styled from "styled-components";

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

// 预览页主体布局，左侧测试项列表，右侧预览区。
export const StyledBody = styled.div`
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
  margin-top: 12px;
`;

// 左侧测试项侧边栏。
export const StyledSidebar = styled.aside`
  width: 300px;
  min-width: 260px;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

// 侧边栏卡片主体。
export const StyledSidebarCard = styled.div`
  flex: 1;
  min-height: 0;
  border: 1px solid #e6e8ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

// 侧边栏头部。
export const StyledSidebarHeader = styled.div`
  padding: 16px 16px 12px;
  border-bottom: 1px solid #eef1f5;
`;

// 侧边栏标题信息块。
export const StyledSidebarHeaderMeta = styled.div`
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

// 侧边栏滚动列表。
export const StyledSidebarList = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
`;

// 单个测试项按钮。
export const StyledSidebarItem = styled.button<{
  $active?: boolean;
  $disabled?: boolean;
}>`
  width: 100%;
  text-align: left;
  border: 1px solid ${({ $active }) => ($active ? "#1677ff" : "#e6e8ef")};
  background: ${({ $active }) => ($active ? "#eff6ff" : "#fff")};
  border-radius: 10px;
  padding: 12px 12px 10px;
  margin-bottom: 8px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  transition: all 0.16s ease;
  opacity: ${({ $disabled }) => ($disabled ? 0.56 : 1)};

  &:hover {
    border-color: ${({ $disabled, $active }) =>
      $disabled ? ($active ? "#1677ff" : "#e6e8ef") : "#1677ff"};
    box-shadow: ${({ $disabled }) =>
      $disabled ? "none" : "0 4px 16px rgba(22, 119, 255, 0.12)"};
  }
`;

// 测试项标题。
export const StyledSidebarItemTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.4;
`;

// 测试项辅助信息。
export const StyledSidebarItemMeta = styled.div`
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
`;

// Viewer 区域样式，独立于头部控制区。
export const StyledViewerWrapper = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
`;

// 对比模式下的双栏网格布局。
export const StyledViewerGrid = styled.div<{ $dual: boolean }>`
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: ${({ $dual }) =>
    $dual ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)"};
  gap: 12px;

  @media (max-width: 1400px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

// 单个预览面板容器。
export const StyledViewerPane = styled.div`
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #e6e8ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  overflow: hidden;
`;

// 预览面板头部。
export const StyledViewerPaneHeader = styled.div`
  padding: 14px 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #eef1f5;
`;

// 预览面板左上角的描述信息块。
export const StyledViewerPaneMeta = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

// 预览面板正文区域。
export const StyledViewerPaneBody = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 12px;
  background: #f8fafc;
`;

// 单个预览面板中的页码指示器。
export const StyledPageIndicator = styled.div`
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.88);
  color: #fff;
  font-size: 12px;
  line-height: 1;
`;
