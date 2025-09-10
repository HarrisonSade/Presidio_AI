#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 VDR Search Backend Setup');
console.log('==========================\n');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

if (majorVersion < 14) {
  console.error('❌ Error: Node.js version 14 or higher is required');
  console.error(`   Current version: ${nodeVersion}`);
  process.exit(1);
}

console.log(`✅ Node.js version: ${nodeVersion}`);

// Check if Java is installed (required for Tika)
try {
  const javaVersion = execSync('java -version 2>&1').toString();
  console.log('✅ Java is installed');
} catch (error) {
  console.warn('⚠️  Warning: Java is not installed or not in PATH');
  console.warn('   Apache Tika requires Java 8 or higher to run');
  console.warn('   Please install Java from: https://www.java.com/download/\n');
}

// Create necessary directories (skip on Vercel since filesystem is read-only)
if (process.env.NODE_ENV !== 'production') {
  const directories = ['uploads', 'logs', 'temp'];

  directories.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}/`);
    } else {
      console.log(`✅ Directory exists: ${dir}/`);
    }
  });
} else {
  console.log('✅ Running in production - using /tmp for file operations');
}

// Create .env file if it doesn't exist
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  const envContent = `# VDR Search Backend Configuration
PORT=3000
NODE_ENV=development
MAX_FILE_SIZE=52428800
SESSION_TIMEOUT=3600000
TIKA_HEAP_SIZE=1024m
`;

  fs.writeFileSync(envPath, envContent);
  console.log('✅ Created .env file');
} else {
  console.log('✅ .env file exists');
}

// Create .gitignore if it doesn't exist
const gitignorePath = path.join(process.cwd(), '.gitignore');
if (!fs.existsSync(gitignorePath)) {
  const gitignoreContent = `# Dependencies
node_modules/

# Uploads and temporary files
uploads/
temp/
*.tmp

# Logs
logs/
*.log

# Environment variables
.env

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
`;

  fs.writeFileSync(gitignorePath, gitignoreContent);
  console.log('✅ Created .gitignore file');
} else {
  console.log('✅ .gitignore file exists');
}

console.log('\n📦 Installing dependencies...\n');

// Install npm dependencies
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('\n✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Error installing dependencies:', error.message);
  process.exit(1);
}

// Download Tika JAR if needed
console.log('\n📥 Setting up Apache Tika...\n');
try {
  execSync('npm run install-tika', { stdio: 'inherit' });
  console.log('\n✅ Apache Tika setup completed');
} catch (error) {
  console.warn('⚠️  Warning: Could not download Tika JAR automatically');
  console.warn('   The node-tika package will download it on first use');
}

console.log('\n✨ Setup completed successfully!\n');
console.log('To start the server:');
console.log('  npm start        - Run in production mode');
console.log('  npm run dev      - Run in development mode with auto-reload\n');
console.log('API will be available at http://localhost:3000');
console.log('\nEndpoints:');
console.log('  POST   /api/vdr/upload');
console.log('  POST   /api/vdr/search');
console.log('  GET    /api/vdr/session/:sessionId');
console.log('  DELETE /api/vdr/session/:sessionId');
console.log('  POST   /api/vdr/extract');
console.log('  GET    /api/vdr/health');
console.log('  GET    /api/vdr/supported-formats\n');