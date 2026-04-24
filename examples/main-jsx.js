// Stub React.createElement so the JSX has somewhere to land.
global.React = {
  createElement(tag, props, ...children) {
    return { tag, props, children };
  },
};

const { Greet } = require('./greet.jsx');

Greet({ name: 'admin', loud: true });
Greet({ name: 'admin', loud: false });
Greet({ name: 'bob', loud: true });
Greet({ name: 'bob', loud: false });
Greet({ name: '', loud: false });
