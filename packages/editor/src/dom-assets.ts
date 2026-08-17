/// <reference path="./asset-modules.d.ts" />

import AssistantBold from '@excalidraw/excalidraw/fonts/Assistant/Assistant-Bold.woff2'
import AssistantMedium from '@excalidraw/excalidraw/fonts/Assistant/Assistant-Medium.woff2'
import AssistantRegular from '@excalidraw/excalidraw/fonts/Assistant/Assistant-Regular.woff2'
import AssistantSemiBold from '@excalidraw/excalidraw/fonts/Assistant/Assistant-SemiBold.woff2'
import KaTeXAMSRegular from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2'
import KaTeXCaligraphicBold from 'katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2'
import KaTeXCaligraphicRegular from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2'
import KaTeXFrakturBold from 'katex/dist/fonts/KaTeX_Fraktur-Bold.woff2'
import KaTeXFrakturRegular from 'katex/dist/fonts/KaTeX_Fraktur-Regular.woff2'
import KaTeXMainBold from 'katex/dist/fonts/KaTeX_Main-Bold.woff2'
import KaTeXMainBoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2'
import KaTeXMainItalic from 'katex/dist/fonts/KaTeX_Main-Italic.woff2'
import KaTeXMainRegular from 'katex/dist/fonts/KaTeX_Main-Regular.woff2'
import KaTeXMathBoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2'
import KaTeXMathItalic from 'katex/dist/fonts/KaTeX_Math-Italic.woff2'
import KaTeXSansSerifBold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2'
import KaTeXSansSerifItalic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.woff2'
import KaTeXSansSerifRegular from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2'
import KaTeXScriptRegular from 'katex/dist/fonts/KaTeX_Script-Regular.woff2'
import KaTeXSize1Regular from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2'
import KaTeXSize2Regular from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2'
import KaTeXSize3Regular from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2'
import KaTeXSize4Regular from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2'
import KaTeXTypewriterRegular from 'katex/dist/fonts/KaTeX_Typewriter-Regular.woff2'

export interface EditorFontFaceAsset {
  display: 'block' | 'swap'
  family: string
  source: string
  style?: 'italic' | 'normal'
  weight?: '400' | '500' | '600' | '700' | 'bold' | 'normal'
}

export const editorFontFaceAssets: readonly EditorFontFaceAsset[] = [
  { display: 'swap', family: 'Assistant', source: AssistantRegular, weight: '400' },
  { display: 'swap', family: 'Assistant', source: AssistantMedium, weight: '500' },
  { display: 'swap', family: 'Assistant', source: AssistantSemiBold, weight: '600' },
  { display: 'swap', family: 'Assistant', source: AssistantBold, weight: '700' },
  { display: 'block', family: 'KaTeX_AMS', source: KaTeXAMSRegular },
  { display: 'block', family: 'KaTeX_Caligraphic', source: KaTeXCaligraphicBold, weight: 'bold' },
  { display: 'block', family: 'KaTeX_Caligraphic', source: KaTeXCaligraphicRegular },
  { display: 'block', family: 'KaTeX_Fraktur', source: KaTeXFrakturBold, weight: 'bold' },
  { display: 'block', family: 'KaTeX_Fraktur', source: KaTeXFrakturRegular },
  { display: 'block', family: 'KaTeX_Main', source: KaTeXMainBold, weight: 'bold' },
  { display: 'block', family: 'KaTeX_Main', source: KaTeXMainBoldItalic, style: 'italic', weight: 'bold' },
  { display: 'block', family: 'KaTeX_Main', source: KaTeXMainItalic, style: 'italic' },
  { display: 'block', family: 'KaTeX_Main', source: KaTeXMainRegular },
  { display: 'block', family: 'KaTeX_Math', source: KaTeXMathBoldItalic, style: 'italic', weight: 'bold' },
  { display: 'block', family: 'KaTeX_Math', source: KaTeXMathItalic, style: 'italic' },
  { display: 'block', family: 'KaTeX_SansSerif', source: KaTeXSansSerifBold, weight: 'bold' },
  { display: 'block', family: 'KaTeX_SansSerif', source: KaTeXSansSerifItalic, style: 'italic' },
  { display: 'block', family: 'KaTeX_SansSerif', source: KaTeXSansSerifRegular },
  { display: 'block', family: 'KaTeX_Script', source: KaTeXScriptRegular },
  { display: 'block', family: 'KaTeX_Size1', source: KaTeXSize1Regular },
  { display: 'block', family: 'KaTeX_Size2', source: KaTeXSize2Regular },
  { display: 'block', family: 'KaTeX_Size3', source: KaTeXSize3Regular },
  { display: 'block', family: 'KaTeX_Size4', source: KaTeXSize4Regular },
  { display: 'block', family: 'KaTeX_Typewriter', source: KaTeXTypewriterRegular },
]
