import { useRef, useState } from 'react'

import { resolveRefTaxon } from '../components/orthologSet.ts'

// A species box's text as a taxon, on submit: a taxon the caller already
// knows at once, anything else through NCBI Taxonomy. Each resolve or drop
// replaces the one before, so an answer that lands after something newer was
// asked for is never applied, and its error never shown.
export function useSpeciesResolution() {
  const latest = useRef(0)
  const [state, setState] = useState<{ pending?: true; error?: unknown }>({})

  function resolve(
    text: string,
    known: number | undefined,
    then: (taxId: number) => void,
  ) {
    latest.current += 1
    const request = latest.current
    if (known === undefined) {
      setState({ pending: true })
      resolveRefTaxon(text).then(
        taxId => {
          if (request === latest.current) {
            setState({})
            then(taxId)
          }
        },
        (error: unknown) => {
          if (request === latest.current) {
            setState({ error })
          }
        },
      )
    } else {
      setState({})
      then(known)
    }
  }

  function drop() {
    latest.current += 1
    setState({})
  }

  return { pending: !!state.pending, error: state.error, resolve, drop }
}
