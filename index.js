const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const port = 3000;

// 模型客户端
let modelClient;
let modelConfig;

// 初始化模型客户端
function initModelClient(config) {
  modelConfig = config;
  
  console.log('Initializing model client for:', config.modelType);
  
  // 强制重新加载 openai 模块，确保配置生效
  delete require.cache[require.resolve('openai')];
  
  if (config.modelType === 'openai') {
    // 初始化 OpenAI 客户端
    console.log('Initializing OpenAI client');
    const OpenAI = require('openai');
    modelClient = new OpenAI({
      apiKey: config.openai.apiKey || process.env.OPENAI_API_KEY || 'your-api-key-here'
    });
    console.log('OpenAI client initialized');
  } else if (config.modelType === 'local') {
    // 初始化本地模型客户端
    console.log('Initializing local model client');
    console.log('Local model URL:', config.local.url);
    console.log('Local model name:', config.local.model);
    const OpenAI = require('openai');
    modelClient = new OpenAI({
      apiKey: config.local.apiKey || 'empty',
      baseURL: config.local.url
    });
    console.log('Local model client initialized');
    console.log('Local model client config:', modelClient);
  } else if (config.modelType === 'azure') {
    // 初始化 Azure OpenAI 客户端
    console.log('Initializing Azure OpenAI client');
    const OpenAI = require('openai');
    modelClient = new OpenAI({
      apiKey: config.azure.apiKey,
      baseURL: `${config.azure.endpoint}openai/deployments/${config.azure.model}/`,
      defaultQuery: {
        'api-version': '2024-02-15-preview'
      },
      defaultHeaders: {
        'api-key': config.azure.apiKey
      }
    });
    console.log('Azure OpenAI client initialized');
  } else if (config.modelType === 'anthropic') {
    // 初始化 Anthropic 客户端
    console.log('Initializing Anthropic client');
    // 注意：需要安装 @anthropic-ai/sdk 包
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      modelClient = new Anthropic({
        apiKey: config.anthropic.apiKey
      });
      console.log('Anthropic client initialized');
    } catch (error) {
      console.error('请安装 @anthropic-ai/sdk 包以使用 Anthropic 模型');
      throw error;
    }
  } else {
    console.error('Unknown model type:', config.modelType);
    throw new Error('未知的模型类型');
  }
}

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// 确保上传目录存在
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 代码审核函数
async function reviewCode(code, language) {
  try {
    if (modelConfig.modelType === 'anthropic') {
      // 使用 Anthropic API
      const response = await modelClient.messages.create({
        model: modelConfig.anthropic.model,
        messages: [
          {
            role: "user",
            content: `你是${language}顶级代码审核专家，对我提供的代码做**百分制游戏化审核**：1. 综合评分0-100分2. 自动匹配游戏风称号3. 输出：质量/BUG/风格/安全/性能/优化\n\n请审核以下${language}代码：\n${code}`
          }
        ],
        temperature: 0.3
      });
      return response.content[0].text;
    } else {
      // 使用 OpenAI 兼容 API（包括 Xinference）
      const model = modelConfig.openai?.model || modelConfig.local?.model || modelConfig.azure?.model || "gpt-4";
      const response = await modelClient.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: `你是一个专业的代码审核专家，擅长分析${language}代码。请对以下代码进行全面审核，包括：1. 代码质量评估 2. 潜在的 bug 和问题 3. 代码风格和最佳实践 4. 安全性分析 5. 性能优化建议 6. 给出总体评分（1-10分）`
          },
          {
            role: "user",
            content: `请审核以下${language}代码：\n${code}`
          }
        ],
        temperature: 0.3
      });
      // 处理不同的响应格式
      if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
        return response.choices[0].message.content;
      } else if (response.choices && response.choices[0] && response.choices[0].text) {
        // 处理一些本地模型的响应格式
        return response.choices[0].text;
      } else {
        throw new Error('无效的模型响应格式');
      }
    }
  } catch (error) {
    console.error('Error reviewing code:', error);
    throw error;
  }
}

// 代码解释函数
async function explainCode(code, language) {
  try {
    if (modelConfig.modelType === 'anthropic') {
      // 使用 Anthropic API
      const response = await modelClient.messages.create({
        model: modelConfig.anthropic.model,
        messages: [
          {
            role: "user",
            content: `你是一个专业的代码解释专家，擅长解释${language}代码。请详细解释以下代码的功能、逻辑流程、关键算法和技术点，确保解释清晰易懂。\n\n请解释以下${language}代码：\n${code}`
          }
        ],
        temperature: 0.3
      });
      return response.content[0].text;
    } else {
      // 使用 OpenAI 兼容 API（包括 Xinference）
      const model = modelConfig.openai?.model || modelConfig.local?.model || modelConfig.azure?.model || "gpt-4";
      const response = await modelClient.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: `你是一个专业的代码解释专家，擅长解释${language}代码。请详细解释以下代码的功能、逻辑流程、关键算法和技术点，确保解释清晰易懂。`
          },
          {
            role: "user",
            content: `请解释以下${language}代码：\n${code}`
          }
        ],
        temperature: 0.3
      });
      // 处理不同的响应格式
      if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
        return response.choices[0].message.content;
      } else if (response.choices && response.choices[0] && response.choices[0].text) {
        // 处理一些本地模型的响应格式
        return response.choices[0].text;
      } else {
        throw new Error('无效的模型响应格式');
      }
    }
  } catch (error) {
    console.error('Error explaining code:', error);
    throw error;
  }
}

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 配置多文件上传
const uploadMultiple = multer({ storage: storage }).fields([
  { name: 'codeFiles', maxCount: 100 },
  { name: 'codeFile', maxCount: 1 }
]);

// 处理 JSON 请求的路由
app.post('/review', (req, res) => {
  console.log('Review request received');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Request body:', req.body);
  
  // 检查是否是 JSON 请求
  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    // 处理 JSON 请求
    console.log('Handling JSON request');
    handleReviewJSONRequest(req, res);
  } else {
    // 处理文件上传请求
    console.log('Handling file upload request');
    uploadMultiple(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ error: '文件上传失败：' + err.message });
      }
      console.log('Upload successful, handling review request');
      handleReviewFileRequest(req, res);
    });
  }
});

// 处理 JSON 请求
async function handleReviewJSONRequest(req, res) {
  try {
    console.log('Body:', req.body);
    
    let code = '';
    let language = req.body.language || 'javascript';
    let config = req.body.config;
    
    // 检查配置是否存在
    if (!config) {
      return res.status(400).json({ error: '配置不存在' });
    }
    
    console.log('Config:', config);
    console.log('Model type:', config.modelType);
    console.log('Local config:', config.local);
    
    // 确保配置是正确的本地模型配置
    if (config.modelType !== 'local') {
      return res.status(400).json({ error: '配置类型不是本地模型' });
    }
    
    if (!config.local || !config.local.url || !config.local.model) {
      return res.status(400).json({ error: '本地模型配置不完整' });
    }
    
    // 初始化模型客户端
    initModelClient(config);
    console.log('Model client initialized');
    console.log('Current model config:', modelConfig);
    console.log('Current model client:', modelClient);
    
    // 直接从请求体中获取代码
    if (req.body.code) {
      code = req.body.code;
    } else {
      return res.status(400).json({ error: '请提供代码内容' });
    }
    
    // 直接测试本地模型，不使用 reviewCode 函数
    try {
      console.log('Testing local model connection...');
      const response = await modelClient.chat.completions.create({
        model: config.local.model,
        messages: [
          {
            role: "system",
            content: `你是一个专业的代码审核专家，擅长分析${language}代码。请对以下代码进行全面审核，包括：1. 代码质量评估 2. 潜在的 bug 和问题 3. 代码风格和最佳实践 4. 安全性分析 5. 性能优化建议 6. 给出总体评分（1-10分）`
          },
          {
            role: "user",
            content: `请审核以下${language}代码：\n${code}`
          }
        ],
        temperature: 0.3
      });
      
      console.log('Local model response:', response);
      
      // 处理响应
      let result = '';
      if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
        result = response.choices[0].message.content;
      } else if (response.choices && response.choices[0] && response.choices[0].text) {
        result = response.choices[0].text;
      } else {
        throw new Error('无效的模型响应格式');
      }
      
      res.json({ result: result });
    } catch (testError) {
      console.error('Local model connection error:', testError);
      return res.status(500).json({ error: '本地模型连接失败：' + testError.message });
    }
  } catch (error) {
    console.error('Error handling JSON request:', error);
    res.status(500).json({ error: '代码审核失败：' + error.message });
  }
}

// 处理文件上传请求
async function handleReviewFileRequest(req, res) {
  try {
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    let code = '';
    let language = req.body.language || 'javascript';
    let config = {};
    
    // 尝试解析配置
    try {
      // 检查 req.body.config 是否存在
      if (!req.body.config) {
        return res.status(400).json({ error: '配置不存在' });
      }
      
      // 检查 config 是否已经是对象
      if (typeof req.body.config === 'object') {
        config = req.body.config;
      } else {
        config = JSON.parse(req.body.config);
      }
      
      console.log('Config:', config);
      console.log('Model type:', config.modelType);
    } catch (error) {
      console.error('Error parsing config:', error);
      console.log('Raw config:', req.body.config);
      return res.status(400).json({ error: '配置解析失败' });
    }
    
    // 初始化模型客户端
    initModelClient(config);
    console.log('Model client initialized');
    console.log('Current model config:', modelConfig);
    
    if (req.files && req.files.codeFiles && req.files.codeFiles.length > 0) {
      // 处理多个文件（项目目录）
      for (const file of req.files.codeFiles) {
        const fileContent = fs.readFileSync(file.path, 'utf8');
        code += `\n=== 文件: ${file.originalname} ===\n${fileContent}\n`;
        // 删除临时文件
        fs.unlinkSync(file.path);
      }
    } else if (req.files && req.files.codeFile && req.files.codeFile.length > 0) {
      // 处理单个文件
      const file = req.files.codeFile[0];
      code = fs.readFileSync(file.path, 'utf8');
      // 删除临时文件
      fs.unlinkSync(file.path);
    } else if (req.body.code) {
      // 直接从请求体中获取代码
      code = req.body.code;
    } else {
      return res.status(400).json({ error: '请提供代码文件或代码内容' });
    }
    
    const reviewResult = await reviewCode(code, language);
    res.json({ result: reviewResult });
  } catch (error) {
    console.error('Error handling file request:', error);
    res.status(500).json({ error: '代码审核失败：' + error.message });
  }
}

async function handleReviewRequest(req, res) {
  try {
    let code = '';
    let language = req.body.language || 'javascript';
    let config = {};
    
    // 尝试解析配置
    try {
      // 检查 req.body.config 是否存在
      if (!req.body.config) {
        return res.status(400).json({ error: '配置不存在' });
      }
      
      // 检查 config 是否已经是对象
      if (typeof req.body.config === 'object') {
        config = req.body.config;
      } else {
        config = JSON.parse(req.body.config);
      }
      
      console.log('Config:', config);
      console.log('Model type:', config.modelType);
    } catch (error) {
      console.error('Error parsing config:', error);
      console.log('Raw config:', req.body.config);
      return res.status(400).json({ error: '配置解析失败' });
    }
    
    // 初始化模型客户端
    initModelClient(config);
    console.log('Model client initialized');
    console.log('Current model config:', modelConfig);
    
    if (req.files && req.files.codeFiles && req.files.codeFiles.length > 0) {
      // 处理多个文件（项目目录）
      for (const file of req.files.codeFiles) {
        const fileContent = fs.readFileSync(file.path, 'utf8');
        code += `\n=== 文件: ${file.originalname} ===\n${fileContent}\n`;
        // 删除临时文件
        fs.unlinkSync(file.path);
      }
    } else if (req.files && req.files.codeFile && req.files.codeFile.length > 0) {
      // 处理单个文件
      const file = req.files.codeFile[0];
      code = fs.readFileSync(file.path, 'utf8');
      // 删除临时文件
      fs.unlinkSync(file.path);
    } else if (req.body.code) {
      // 直接从请求体中获取代码
      code = req.body.code;
    } else {
      return res.status(400).json({ error: '请提供代码文件或代码内容' });
    }
    
    const reviewResult = await reviewCode(code, language);
    res.json({ result: reviewResult });
  } catch (error) {
    res.status(500).json({ error: '代码审核失败：' + error.message });
  }
}

app.post('/explain', (req, res) => {
  console.log('Explain request received');
  console.log('Content-Type:', req.headers['content-type']);
  
  // 检查是否是 JSON 请求
  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    // 处理 JSON 请求
    console.log('Handling JSON request');
    handleExplainJSONRequest(req, res);
  } else {
    // 处理文件上传请求
    console.log('Handling file upload request');
    uploadMultiple(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ error: '文件上传失败：' + err.message });
      }
      console.log('Upload successful, handling explain request');
      handleExplainFileRequest(req, res);
    });
  }
});

// 处理 JSON 请求
async function handleExplainJSONRequest(req, res) {
  try {
    console.log('Body:', req.body);
    
    let code = '';
    let language = req.body.language || 'javascript';
    let config = req.body.config;
    
    // 检查配置是否存在
    if (!config) {
      return res.status(400).json({ error: '配置不存在' });
    }
    
    console.log('Config:', config);
    console.log('Model type:', config.modelType);
    
    // 初始化模型客户端
    initModelClient(config);
    console.log('Model client initialized');
    console.log('Current model config:', modelConfig);
    
    // 直接从请求体中获取代码
    if (req.body.code) {
      code = req.body.code;
    } else {
      return res.status(400).json({ error: '请提供代码内容' });
    }
    
    const explainResult = await explainCode(code, language);
    res.json({ result: explainResult });
  } catch (error) {
    console.error('Error handling JSON request:', error);
    res.status(500).json({ error: '代码解释失败：' + error.message });
  }
}

// 处理文件上传请求
async function handleExplainFileRequest(req, res) {
  try {
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    let code = '';
    let language = req.body.language || 'javascript';
    let config = {};
    
    // 尝试解析配置
    try {
      // 检查 req.body.config 是否存在
      if (!req.body.config) {
        return res.status(400).json({ error: '配置不存在' });
      }
      
      // 检查 config 是否已经是对象
      if (typeof req.body.config === 'object') {
        config = req.body.config;
      } else {
        config = JSON.parse(req.body.config);
      }
      
      console.log('Config:', config);
      console.log('Model type:', config.modelType);
    } catch (error) {
      console.error('Error parsing config:', error);
      console.log('Raw config:', req.body.config);
      return res.status(400).json({ error: '配置解析失败' });
    }
    
    // 初始化模型客户端
    initModelClient(config);
    console.log('Model client initialized');
    console.log('Current model config:', modelConfig);
    
    if (req.files && req.files.codeFiles && req.files.codeFiles.length > 0) {
      // 处理多个文件（项目目录）
      for (const file of req.files.codeFiles) {
        const fileContent = fs.readFileSync(file.path, 'utf8');
        code += `\n=== 文件: ${file.originalname} ===\n${fileContent}\n`;
        // 删除临时文件
        fs.unlinkSync(file.path);
      }
    } else if (req.files && req.files.codeFile && req.files.codeFile.length > 0) {
      // 处理单个文件
      const file = req.files.codeFile[0];
      code = fs.readFileSync(file.path, 'utf8');
      // 删除临时文件
      fs.unlinkSync(file.path);
    } else if (req.body.code) {
      // 直接从请求体中获取代码
      code = req.body.code;
    } else {
      return res.status(400).json({ error: '请提供代码文件或代码内容' });
    }
    
    const explainResult = await explainCode(code, language);
    res.json({ result: explainResult });
  } catch (error) {
    console.error('Error handling file request:', error);
    res.status(500).json({ error: '代码解释失败：' + error.message });
  }
}

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});

module.exports = app;