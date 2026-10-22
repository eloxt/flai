// Ported from thesysdev/open-intelligent-ui (MIT): src/lib/functions, without the dashboard data and color groups.
import { dateFunctions } from './dates'
import { listFunctions } from './lists'
import { numberFunctions } from './numbers'
import { textFunctions } from './text'

/**
 * Generic functions the model calls as @Name(args) to compute inside a page:
 * edit lists held in $variables, do the math, and format text and dates.
 * They are pure except @Random, @Pick, @Shuffle, @Now and @Today. Bad
 * arguments, or a throw, make a call evaluate to null.
 */
export const genuiFunctions = [...listFunctions, ...numberFunctions, ...textFunctions, ...dateFunctions]
