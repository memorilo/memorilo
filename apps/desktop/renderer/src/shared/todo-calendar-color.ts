import uniqolor from 'uniqolor'

export function todoCalendarColor(subscriptionId: string): string {
  return uniqolor(subscriptionId, {
    format: 'hsl',
    lightness: [42, 50],
    saturation: [62, 72],
  }).color
}
