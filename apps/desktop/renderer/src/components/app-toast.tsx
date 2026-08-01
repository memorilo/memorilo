import type { CloseButtonProps, IconProps } from 'react-toastify/unstyled'
import { Check, CircleAlert, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { cssTransition, ToastContainer } from 'react-toastify/unstyled'

import './app-toast.stylex'

const materialize = cssTransition({
  collapseDuration: 180,
  enter: 'memorilo-toast-enter',
  exit: 'memorilo-toast-exit',
})

function ToastStatusIcon({ isLoading, type }: IconProps) {
  if (isLoading)
    return <LoaderCircle aria-hidden="true" className="memorilo-toast-spinner" />

  const Icon = {
    default: null,
    error: CircleAlert,
    info: Info,
    success: Check,
    warning: TriangleAlert,
  }[type]

  if (!Icon)
    return null

  return <Icon aria-hidden="true" strokeWidth={1.8} />
}

function ToastDismissButton({ closeToast }: CloseButtonProps) {
  return (
    <button
      aria-label="Dismiss notification"
      className="memorilo-toast-dismiss"
      type="button"
      onClick={closeToast}
    >
      <X aria-hidden="true" strokeWidth={2} />
    </button>
  )
}

export function AppToastContainer() {
  return (
    <ToastContainer
      aria-label="Notifications"
      autoClose={5_000}
      className="memorilo-toast-container"
      closeButton={ToastDismissButton}
      closeOnClick={false}
      draggable="touch"
      hideProgressBar
      icon={ToastStatusIcon}
      limit={4}
      newestOnTop
      pauseOnFocusLoss
      pauseOnHover
      position="top-right"
      progressClassName="memorilo-toast-progress"
      theme="light"
      toastClassName="memorilo-toast"
      transition={materialize}
    />
  )
}
