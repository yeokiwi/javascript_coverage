const { canLogin, label } = require('./login.ts');

canLogin({ name: 'admin', active: true }, null);
canLogin({ name: 'bob', active: true }, 'tok');
canLogin({ name: 'bob', active: false }, 'tok');
canLogin(null, 'tok');
canLogin({ name: 'bob', active: true }, null);

label(0);
label(3);
label(-1);
