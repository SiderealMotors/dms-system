import * as unzipper from 'unzipper';

const zipUrl = 'https://v0chat-agent-data-prod.s3.us-east-1.amazonaws.com/vm-binary/OI6qemn7WDU/ed5bca557c610f4a9ec2bcb2943865d9895dac842bda91a41e89de1dbe38f93e.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA52KF4VHQDTZ5RDMT%2F20260323%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260323T003637Z&X-Amz-Expires=3600&X-Amz-Signature=f6f4928575e7534377a9965b1c8c04d632d891baa7bca96b4ed587d119f4e99e&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject';

// Files to read (key backend/frontend files)
const filesToRead = [
  // Prisma schema - crucial for database structure
  'dms/backend/prisma/schema.prisma',
  
  // Backend services - accounting
  'dms/backend/src/accounting/accounting.service.ts',
  'dms/backend/src/accounting/gl-accounts.service.ts',
  'dms/backend/src/accounting/journal-entries.service.ts',
  'dms/backend/src/accounting/accounting-reports.service.ts',
  
  // Backend services - CRM
  'dms/backend/src/crm/customers.service.ts',
  'dms/backend/src/crm/leads.service.ts',
  'dms/backend/src/crm/deals.service.ts',
  
  // Backend services - Inventory
  'dms/backend/src/inventory/vehicles/vehicles.service.ts',
  
  // Backend services - Dashboard
  'dms/backend/src/dashboard/dashboard.service.ts',
  
  // Frontend components
  'dms/frontend/src/components/inventory/VehicleTable.tsx',
  'dms/frontend/src/components/crm/LeadPipelineBoard.tsx',
  'dms/frontend/src/components/inventory/VehicleFormDrawer.tsx',
  
  // Frontend pages
  'dms/frontend/src/app/page.tsx',
  'dms/frontend/src/app/layout.tsx',
  'dms/frontend/src/app/inventory/page.tsx',
  'dms/frontend/src/app/crm/page.tsx',
];

async function readFiles() {
  try {
    const response = await fetch(zipUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const directory = await unzipper.Open.buffer(Buffer.from(buffer));
    
    for (const targetFile of filesToRead) {
      const file = directory.files.find(f => f.path === targetFile);
      if (file) {
        const content = await file.buffer();
        console.log(`\n========== FILE: ${targetFile} ==========`);
        console.log(content.toString('utf-8'));
        console.log(`========== END: ${targetFile} ==========\n`);
      } else {
        console.log(`\nFile not found: ${targetFile}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

readFiles();
