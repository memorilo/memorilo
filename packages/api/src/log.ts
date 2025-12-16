import * as log from '@tauri-apps/plugin-log'
import { Array, pipe } from 'effect'

function pureText(...msg: any[]) {
  return pipe(
    msg,
    Array.map(m => (typeof m === 'string' ? m : JSON.stringify(m))),
    Array.join(' '),
  )
}

export default {
  info: (...msg: any[]) => log.info(pureText(...msg)),
  error: (...msg: any[]) => log.error(pureText(...msg)),
  warn: (...msg: any[]) => log.warn(pureText(...msg)),
  debug: (...msg: any[]) => log.debug(pureText(...msg)),
  trace: (...msg: any[]) => log.trace(pureText(...msg)),
}
