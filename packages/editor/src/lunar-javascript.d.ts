declare module 'lunar-javascript' {
  interface LunarDate {
    getMonth: () => number
    getDay: () => number
  }

  interface SolarDate {
    getLunar: () => LunarDate
  }

  export const Solar: {
    fromYmd: (year: number, month: number, day: number) => SolarDate
  }
}
