// h3/Nitro's JSON.stringify chokes on bigint by default ("Do not know how to
// serialize a BigInt").  All our monetary columns are bigints, and we don't
// want every handler to remember to .toString() them.  The community-standard
// workaround is to teach BigInt how to serialise itself as a string; clients
// that need to do arithmetic can `BigInt(stringValue)` on the way in.
//
// Safe because nothing else in the runtime relies on BigInt missing toJSON.

export default defineNitroPlugin(() => {
  type WithToJson = { toJSON?: () => string }
  if (typeof (BigInt.prototype as unknown as WithToJson).toJSON !== 'function') {
    Object.defineProperty(BigInt.prototype, 'toJSON', {
      value: function (this: bigint) { return this.toString() },
      writable: true,
      configurable: true,
    })
  }
})
