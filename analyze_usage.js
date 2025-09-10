const fs = require('fs');
const path = require('path');

// Parse timestamps from file names (they're Unix timestamps in milliseconds)
const getDateFromFilename = (filename) => {
  const match = filename.match(/_(\d{13})\./);
  if (match) {
    return new Date(parseInt(match[1]));
  }
  return null;
};

// Read all files in outputs directory
const outputsDir = path.join(__dirname, 'outputs');
const files = fs.readdirSync(outputsDir);

// Count usage by tool and month
const usage = {};
const toolTypes = {
  'banker_questions': 'Banker Questions',
  'contract_waterfall': 'Contract Waterfall', 
  'ic_summary': 'IC Summary',
  'podcast': 'Podcast Generator',
  'summary': 'Podcast Generator',
  'translated': 'Podcast Generator'
};

files.forEach(file => {
  const date = getDateFromFilename(file);
  if (!date) return;
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 0-indexed
  
  // Only count files from 2025
  if (year !== 2025) return;
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthYear = monthNames[month - 1] + ' ' + year;
  
  const toolPrefix = file.split('_')[0];
  const tool = toolTypes[toolPrefix] || toolPrefix;
  
  if (!usage[monthYear]) usage[monthYear] = {};
  if (!usage[monthYear][tool]) usage[monthYear][tool] = 0;
  usage[monthYear][tool]++;
});

// Also count primer usage from the history file
try {
  const primerData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'primer-history.json'), 'utf8'));
  primerData.forEach(entry => {
    const date = new Date(entry.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    if (year !== 2025) return;
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthYear = monthNames[month - 1] + ' ' + year;
    
    if (!usage[monthYear]) usage[monthYear] = {};
    if (!usage[monthYear]['Primer']) usage[monthYear]['Primer'] = 0;
    usage[monthYear]['Primer']++;
  });
} catch (e) {
  console.log('Could not read primer history');
}

// Filter for last 3 months (Jun-Aug 2025)
const targetMonths = ['Jun 2025', 'Jul 2025', 'Aug 2025'];
const filteredUsage = {};
targetMonths.forEach(month => {
  if (usage[month]) filteredUsage[month] = usage[month];
});

console.log('Tool Usage for Past 3 Months (Jun-Aug 2025):');
console.log('='.repeat(50));

// Count NDA Review (no output files, need to check if route was used)
// For now, we'll note it wasn't trackable through output files

targetMonths.forEach(month => {
  console.log('\n' + month + ':');
  if (filteredUsage[month]) {
    Object.entries(filteredUsage[month]).forEach(([tool, count]) => {
      console.log('  ' + tool + ': ' + count);
    });
  } else {
    console.log('  No usage recorded');
  }
});

// Calculate totals
console.log('\n' + '='.repeat(50));
console.log('TOTAL USAGE SUMMARY:');
const totals = {};
Object.values(filteredUsage).forEach(monthData => {
  Object.entries(monthData).forEach(([tool, count]) => {
    if (!totals[tool]) totals[tool] = 0;
    totals[tool] += count;
  });
});

// Consolidate Podcast Generator counts
if (totals['Podcast Generator']) {
  // Already consolidated
} else {
  totals['Podcast Generator'] = 0;
}

// Sort and display
Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([tool, count]) => {
  console.log('  ' + tool + ': ' + count + ' uses');
});

console.log('\nNote: NDA Review and Slide Generator tools do not generate trackable output files.');
console.log('Their usage cannot be determined from available data.');