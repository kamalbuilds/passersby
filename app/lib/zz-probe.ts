import { useState } from 'react'
export function bad(a: boolean) {
  if (a) { useState(0) }
  return 1
}
