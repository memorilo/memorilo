import { getContextMenuLabel } from "../components/hyperlink/Hyperlink";
import { isElementLinkEnabled } from "../components/hyperlink/helpers";
import { LinkIcon } from "../components/icons";
import { ToolButton } from "../components/ToolButton";
import { isEmbeddableElement } from "../element/typeChecks";
import { t } from "../i18n";
import { KEYS } from "../keys";
import { getSelectedElements } from "../scene";
import { CaptureUpdateAction } from "../store";
import type { ExcalidrawProps } from "../types";
import { getShortcutKey } from "../utils";
import { register } from "./register";

const canEditSelectedElementLink = (
  elements: Parameters<typeof getSelectedElements>[0],
  appState: Parameters<typeof getSelectedElements>[1],
  appProps: ExcalidrawProps,
) => {
  const selectedElements = getSelectedElements(elements, appState);
  return (
    selectedElements.length === 1 &&
    isElementLinkEnabled(selectedElements[0], appProps)
  );
};

export const actionLink = register({
  name: "hyperlink",
  label: (elements, appState) => getContextMenuLabel(elements, appState),
  icon: LinkIcon,
  perform: (elements, appState, _, app) => {
    if (!canEditSelectedElementLink(elements, appState, app.props)) {
      return false;
    }

    if (appState.showHyperlinkPopup === "editor") {
      return false;
    }

    return {
      elements,
      appState: {
        ...appState,
        showHyperlinkPopup: "editor",
        openMenu: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  trackEvent: { category: "hyperlink", action: "click" },
  keyTest: (event, appState, elements, app) =>
    event[KEYS.CTRL_OR_CMD] &&
    event.key === KEYS.K &&
    canEditSelectedElementLink(elements, appState, app.props),
  predicate: (elements, appState, appProps) =>
    canEditSelectedElementLink(elements, appState, appProps),
  PanelComponent: ({ elements, appState, updateData, appProps }) => {
    const selectedElements = getSelectedElements(elements, appState);
    const selectedElement = selectedElements[0];

    if (
      !selectedElement ||
      !isElementLinkEnabled(selectedElement, appProps)
    ) {
      return null;
    }

    return (
      <ToolButton
        type="button"
        icon={LinkIcon}
        aria-label={t(getContextMenuLabel(elements, appState))}
        title={`${
          isEmbeddableElement(selectedElement)
            ? t("labels.link.labelEmbed")
            : t("labels.link.label")
        } - ${getShortcutKey("CtrlOrCmd+K")}`}
        onClick={() => updateData(null)}
        selected={!!selectedElement.link}
      />
    );
  },
});
