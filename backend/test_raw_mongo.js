const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://taskflow_user:Vedant2000@cluster0.gtq7fcd.mongodb.net/vedaai?appName=Cluster0';

console.log('Connecting to MongoClient...');
MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000 })
  .then((client) => {
    console.log('✅ Connection successful!');
    client.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  });
