import { injectGlobalStyle } from '../../../styles/inject-global-stylex'

// Excalidraw owns these generated class names, so its layout adapter stays at
// the Whiteboard integration seam instead of leaking into renderer globals.
injectGlobalStyle(String.raw`
[data-topic-type="whiteboard"] .App-menu_top__left {
  margin-top: 56px;
}

[data-topic-type="whiteboard"] .layer-ui__wrapper__top-right,
[data-topic-type="whiteboard"] .shapes-section {
  margin-top: -6px;
}

[data-topic-type="whiteboard"] .excalidraw--mobile .App-toolbar--mobile {
  transform: translateX(32px);
}

[data-topic-type="whiteboard"] .App-toolbar-container,
[data-topic-type="whiteboard"] .App-toolbar {
  height: 36px;
}

[data-topic-type="whiteboard"] .App-toolbar {
  --lg-button-size: 32px;
  --padding: 0;
  padding: 1px;
  border-radius: var(--ui-pill-radius);
  backdrop-filter: var(--ui-material-filter);
}
`, 2)
