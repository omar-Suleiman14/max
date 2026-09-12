const fs = require('fs');
const readline = require('readline');

async function processTranscript() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/Lenovo/.gemini/antigravity-ide/brain/1a40aa22-703c-429d-87d8-bd739f85dec6/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity
  });

  let fileContent = fs.readFileSync('src/renderer/ui/notion-block-editor.tsx', 'utf8');

  for await (const line of rl) {
    const entry = JSON.parse(line);
    if (entry.tool_calls) {
      for (const call of entry.tool_calls) {
        if (call.name === 'default_api:replace_file_content' || call.name === 'default_api:multi_replace_file_content') {
          if (call.arguments && typeof call.arguments === 'object') {
            const targetFile = call.arguments.TargetFile;
            if (targetFile && targetFile.endsWith('notion-block-editor.tsx')) {
              // Apply the replacement
              console.log('Found edit in transcript, applying...');
              if (call.name === 'default_api:replace_file_content') {
                const target = call.arguments.TargetContent;
                const replacement = call.arguments.ReplacementContent;
                if (fileContent.includes(target)) {
                    fileContent = fileContent.replace(target, replacement);
                } else {
                    console.log('Target not found in file during replay!');
                }
              } else if (call.name === 'default_api:multi_replace_file_content') {
                for (const chunk of call.arguments.ReplacementChunks) {
                    const target = chunk.TargetContent;
                    const replacement = chunk.ReplacementContent;
                    if (fileContent.includes(target)) {
                        fileContent = fileContent.replace(target, replacement);
                    } else {
                        console.log('Target not found in file during replay!');
                    }
                }
              }
            }
          }
        }
      }
    }
  }

  fs.writeFileSync('src/renderer/ui/notion-block-editor.tsx', fileContent);
  console.log('Reconstruction complete!');
}

processTranscript().catch(console.error);
