const { SyncHook } = require('./lib/index')

const hook = new SyncHook(['a', 'b', 'c'])



hook.tap('A', (a, b, c) => {
  console.log('this', this)
  console.log('A', a, b, c)
})

hook.tap({
  name: 'B',
  stage: -1
  // before: 'A'
}, (a, b, c) => {
  console.log('B', a, b, c)
})

hook.call({
  age: 12
}, 1, 2, 3)