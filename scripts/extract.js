import * as unzipper from 'unzipper';

const zipUrl = 'https://v0chat-agent-data-prod.s3.us-east-1.amazonaws.com/vm-binary/OI6qemn7WDU/ed5bca557c610f4a9ec2bcb2943865d9895dac842bda91a41e89de1dbe38f93e.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA52KF4VHQDTZ5RDMT%2F20260323%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260323T003637Z&X-Amz-Expires=3600&X-Amz-Signature=f6f4928575e7534377a9965b1c8c04d632d891baa7bca96b4ed587d119f4e99e&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject';

async function extractAndPrintFiles() {
  try {
    const response = await fetch(zipUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const directory = await unzipper.Open.buffer(Buffer.from(buffer));
    
    // Get all files sorted
    const files = directory.files.filter(f => f.type !== 'Directory').sort((a, b) => a.path.localeCompare(b.path));
    
    // Key files to read content from
    const keyFiles = [
      'dms/backend/package.json',
      'dms/backend/.env.example',
      'dms/backend/prisma/schema.prisma',
      'dms/frontend/package.json',
      'dms/frontend/.env.example',
      'dms/package.json',
      'dms/README.md',
      'dms/backend/src/app.module.ts',
      'dms/backend/src/main.ts',
      'dms/frontend/src/app/layout.tsx',
      'dms/frontend/src/lib/api.ts',
      'dms/backend/src/auth/auth.service.ts',
      'dms/backend/src/users/users.service.ts'
    ];
    
    console.log('=== Key File Contents ===\n');
    
    for (const keyPath of keyFiles) {
      const file = files.find(f => f.path === keyPath);
      if (file) {
        try {
          const content = await file.buffer();
          console.log(`\n--- ${keyPath} ---`);
          console.log(content.toString('utf-8'));
        } catch (e) {
          console.log(`Error reading ${keyPath}: ${e.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

extractAndPrintFiles();
