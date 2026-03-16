const bcrypt = require('bcryptjs');
require('./src/database/models.js');
const { User, UserSubscription } = require('./src/database/models');

const user = User.findByEmail('mwangapatrick7@gmail.com');
if (user) {
    console.log('=== User Found in Database ===');
    console.log('Email:', user.email);
    console.log('Name:', user.name);
    console.log('Created:', user.createdAt);
    
    const sub = UserSubscription.findByUserId(user.id);
    if (sub) {
        console.log('');
        console.log('=== Subscription Details ===');
        console.log('Plan:', sub.plan.name);
        console.log('Status:', sub.status);
        console.log('Active:', sub.active);
        console.log('Expires:', sub.expiresAt);
    }
    
    // Test password
    const valid = bcrypt.compareSync('power123', user.password);
    console.log('');
    console.log('Password validation:', valid ? 'SUCCESS ✓' : 'FAILED ✗');
} else {
    console.log('User not found!');
}
