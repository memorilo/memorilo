import { defineBasicExtension } from 'prosekit/basic'
import { union } from 'prosekit/core'
import { defineMathBlockSpec, defineMathInlineSpec } from 'prosekit/extensions/math'
import { defineBlockIdAttr } from './block-id-schema'
import { defineCardSchema } from './card-schema'
import { defineImageIdAttr } from './image-schema'
import { defineTagSpec } from './tag-schema'
import { defineTaskAttrs } from './task-schema'

const topicProseMirrorExtension = union(
  defineBasicExtension(),
  defineCardSchema(),
  defineImageIdAttr(),
  defineBlockIdAttr(),
  defineTaskAttrs(),
  defineTagSpec(),
  defineMathBlockSpec(),
  defineMathInlineSpec(),
)

const schema = topicProseMirrorExtension.schema
if (!schema)
  throw new Error('The Topic extension does not define a ProseMirror schema')

export const topicProseMirrorSchema = schema
