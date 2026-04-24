// JSX sample. Note we're not running React — JSX is just transformed to
// React.createElement calls, so we stub React.createElement to observe output.

function Greet({ name, loud }) {
  const header = name && loud ? <h1>HELLO, {name.toUpperCase()}!</h1> : <p>hello, {name || 'world'}</p>;
  if (name === 'admin' || loud) {
    return <section>{header}<small>vip</small></section>;
  }
  return header;
}

module.exports = { Greet };
