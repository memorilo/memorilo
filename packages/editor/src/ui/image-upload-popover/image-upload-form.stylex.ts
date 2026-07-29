import * as stylex from '@stylexjs/stylex'

export const imageUploadFormStyles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    fontSize: 14,
  },
  fileInput: {
    '::file-selector-button': {
      borderWidth: 0,
      padding: 0,
      backgroundColor: 'transparent',
      fontSize: 14,
      fontWeight: 500,
    },
  },
})
