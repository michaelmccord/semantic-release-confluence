const debug = require('debug')('semantic-release-confluence:index');
const getLogger = require('./get-logger');
const SemanticReleaseError = require('@semantic-release/error');
const fs = require('fs');
const path = require('path');
const Confluence = require('confluence-api');
const util = require('util');
const { isString } = require('lodash');



async function getDocumentData(id, username, token, baseUrl) {
  const confluence = new Confluence({
    username,
    password: token,
    baseUrl
  });

  let version = null;
  let space = null;
  let title = null;

  let documentData = null;
  try {
    documentData = await util.promisify(confluence.getCustomContentById).call(confluence, { id, expanders: ['space', 'version'] });
  } catch (error) {
    logger.fatal(`There was an error while trying to determine the existence of document ${id}`);
    throw [new SemanticReleaseError('Error determining document existence', 'E_DET_DOC_EXISTS_REMOTE', `There was an error while trying to determine the exist of a document with ID ${id}`), error];
  }

  if (!documentData)
    throw new SemanticReleaseError('No document data', 'E_DOC_NO_DATA', `No data was returned while retrieving data for the document with ID ${id}`);

  try {
    version = Number.parseInt(documentData.version.number);
  } catch (error) {
    throw [
      new SemanticReleaseError('Document version parse error', 'E_DOC_VERSION_PARSE', `The document version for ID ${id} could not be parsed`),
      error
    ];
  }

  space = documentData.space.key;
  title = documentData.title;

  return {
    space,
    version,
    title
  };
}


async function verifyConditions(pluginConfig, context) {
  const logger = getLogger(context);
  const env = context.env;

  if (!env.CONFLUENCE_USERNAME || !env.CONFLUENCE_USERNAME.trim())
    throw new SemanticReleaseError('CONFLUENCE_USERNAME not provided', 'E_MISSING_CUSERNAME', 'The environment variable "CONFLUENCE_USERNAME" must be provided.');

  if (!env.CONFLUENCE_TOKEN || !env.CONFLUENCE_TOKEN.trim())
    throw new SemanticReleaseError('CONFLUENCE_TOKEN not provided', 'E_MISSING_CTOKEN', 'The environment variable "CONFLUENCE_TOKEN" must be provided.');

  if (!pluginConfig.baseUrl
    || (typeof pluginConfig.baseUrl != 'string')
    || !pluginConfig.baseUrl.trim()) {
    throw new SemanticReleaseError('baseUrl not provided', 'E_MISSING_BASE_URL', 'Must supply an baseUrl in the plugin config.');
  }

  if (!pluginConfig.documentID
    || (typeof pluginConfig.documentID != 'string')
    || !pluginConfig.documentID.trim()) {
    throw new SemanticReleaseError('documentID not provided', 'E_MISSING_DOC_ID', 'Must supply a documentID in the plugin config.');
  }

  if (!pluginConfig.documentPath
    || (typeof pluginConfig.documentPath != 'string')
    || !pluginConfig.documentPath.trim()) {
    throw new SemanticReleaseError('documentPath not provided', 'E_MISSING_PATH', 'Must supply a documentPath in the plugin config.');
  }

  let exists = false;
  try {
    exists = fs.existsSync(path.resolve(context.cwd, pluginConfig.documentPath));
  } catch (error) {
    logger.fatal(`There was an error determining if the path at ${pluginConfig.documentPath} exists.`);
    throw [SemanticReleaseError('Error determing documentPath existence', 'E_DOC_FS_EXISTS', `There was an error while trying to determine the existence of ${pluginConfig.documentPath}`), error];
  }

  if (!exists) {
    throw new SemanticReleaseError('File at documentPath does not exist', 'E_DOC_EXISTS', `The document at ${pluginConfig.documentPath} does not exist`);
  }

  let docData = await getDocumentData(pluginConfig.documentID, env.CONFLUENCE_USERNAME, env.CONFLUENCE_TOKEN, pluginConfig.baseUrl);

  let attachmentsExists = false;

  try {
    if (pluginConfig.attachmentsDir)
      attachmentsExists = fs.existsSync(pluginConfig.attachmentsDir);
  } catch (error) {
    logger.fatal('There was an error determining if the attachments directory exists...');
    throw [new SemanticReleaseError('Error determing attachmentsDir existence', 'E_ATT_DET_EXISTS', `Could not determine the existence of ${pluginConfig.attachmentsDir}`), error];
  }

  if (pluginConfig.attachmentsDir && !attachmentsExists)
    throw new SemanticReleaseError('attachmentsDir does not exists', 'E_ATT_DIR_EXISTS', `${pluginConfig.attachmentsDir} does not exist`);

  await loadAndAnalyzeAttachments(pluginConfig, context, logger, docData);

  logger.info('Configuration is valid.');

}

function getAttachmentsFromDir(dir, cwd) {
  const attachmentsDir = path.resolve(cwd, dir);
  return fs.readdirSync(attachmentsDir);
}

async function getAttachmentsFromConfluence(id, space, username, token, baseUrl) {
  const confluence = new Confluence({
    username,
    password: token,
    baseUrl
  });

  const attachmentData = await util.promisify(confluence.getAttachments)
    .call(confluence, space, id);

  return attachmentData.results;
}

function analyzeAttachments(attachmentFiles, attachmentData) {
  let result = {};

  attachmentFiles.forEach(a => {
    if (!result[a])
      result[a] = { id: null, title: a, disposition: 'Add' };
  });

  attachmentData.forEach(a => {
    if (!result[a.title])
      result[a.title] = { id: a.id, title: a.title, disposition: 'Remove' };
    else {
      result[a.title].id = a.id;
      result[a.title].disposition = 'Update';
      result[a.title].title = a.title;
    }
  });

  return result;
}

async function loadAndAnalyzeAttachments(pluginConfig, context, logger, docData) {
  logger.info('Analyzing attachments...');
  const { env } = context;
  logger.info(`Loading attachments from ${pluginConfig.attachmentsDir}`);

  let attachDirAttachments = null;
  try {
    attachDirAttachments = getAttachmentsFromDir(pluginConfig.attachmentsDir, context.cwd);
  } catch (error) {
    logger.fatal(`There was an error loading attachments from ${pluginConfig.attachmentsDir}`);
    throw [new SemanticReleaseError('Error loading attachments frm attachmentsDir', 'E_LOAD_ATTACH_DIR', `There was an error loading attachments from ${pluginConfig.attachmentsDir}`), error];
  }

  logger.info(`Attachments loaded: \n${attachDirAttachments.length > 0 ? attachDirAttachments.join('\n') : 'None'}`);

  logger.info('Loading attachments from Confluence');
  let confluenceAttachments = null;
  try {
    confluenceAttachments = await getAttachmentsFromConfluence(pluginConfig.documentID, docData.space, env.CONFLUENCE_USERNAME, env.CONFLUENCE_TOKEN, pluginConfig.baseUrl);
  } catch (error) {
    logger.fatal('There was an error loading attachments from confluence');
    throw [new SemanticReleaseError('Error loading attachments from confluence', 'E_ATTACH_LOAD_CONFLUENCE', 'There was an error loading attachments from confluence'), error];
  }
  logger.info(`Attachments loaded: \n${confluenceAttachments.length > 0 ? confluenceAttachments.map(a => a.title).join('\n') : 'None'}`);

  logger.info('Analyzing attachments...');
  const result = analyzeAttachments(attachDirAttachments, confluenceAttachments);
  const keys = Object.keys(result);
  const logInfo = keys.length > 0
    ? keys.map(k => result[k]).map(a => `id: ${a.id}, title: ${a.title}, disposition: ${a.disposition}`).join('\n')
    : 'None';
  logger.info(`Attachments analyzed: \n ${logInfo}`);


  return result;
}


async function publishAttachments(pluginConfig, context, logger, docData, attachments) {
  logger.info('Publishing attachments...');
  const { env } = context;
  const confluence = new Confluence({
    username: env.CONFLUENCE_USERNAME,
    password: env.CONFLUENCE_TOKEN,
    baseUrl: pluginConfig.baseUrl
  });

  const attachDir = path.resolve(context.cwd, pluginConfig.attachmentsDir);

  attachments = Object.entries(attachments).map(([key, value]) => value);

  attachments.forEach(a => {
    a.path = path.resolve(attachDir, a.title);
  });

  const attachmentsToRemove = attachments.filter(a => a.disposition !== 'Remove');
  const attachmentsToAdd = attachments.filter(a => a.disposition !== 'Add');
  const attachmentsToUpdate = attachments.filter(a => a.disposition !== 'Update');

  try {
    const removals = attachmentsToRemove.map(a => util.promisify(confluence.deleteContent).call(confluence, a.id));
    const additions = attachmentsToAdd.map(a => util.promisify(confluence.createAttachment).call(confluence, docData.space, pluginConfig.documentID, a.path));
    const updates = attachmentsToUpdate.map(a => util.promisify(confluence.updateAttachmentData).call(confluence, null, pluginConfig.documentID, a.id, a.path));
    await Promise.allSettled([...removals, ...additions, ...updates]);
  } catch (error) {
    logger.fatal('There was an error publishing attachments to Confluence');
    throw [new SemanticReleaseError('Error publishing attachments', 'E_PUB_ATTACH', 'There was an error publishing attachments to confluence'), ...error];
  }
  logger.info('Attachments published.');
}

async function publish(pluginConfig, context) {
  const logger = getLogger(context);
  const env = context.env;

  logger.info('Publishing to confluence...');

  logger.info('Loading document data from Confluence...');
  let docData = await getDocumentData(pluginConfig.documentID, env.CONFLUENCE_USERNAME, env.CONFLUENCE_TOKEN, pluginConfig.baseUrl);
  logger.info('Document data loaded.');


  if (pluginConfig.attachmentsDir) {
    const attachments = await loadAndAnalyzeAttachments(pluginConfig, context, logger, docData);
    await publishAttachments(pluginConfig, context, logger, docData, attachments);
  }



  const confluence = new Confluence({
    username: env.CONFLUENCE_USERNAME,
    password: env.CONFLUENCE_TOKEN,
    baseUrl: pluginConfig.baseUrl
  });

  let documentContent = null;
  try {
    documentContent = fs.readFileSync(pluginConfig.documentPath, 'utf-8');
  } catch (error) {
    throw [
      new SemanticReleaseError('Error loading content', 'E_CONTENT', `There was an error loading the content at path ${pluginConfig.documentPath}`),
      error
    ];
  }

  if (!documentContent || !isString(documentContent) || !documentContent.trim())
    throw new SemanticReleaseError('Document empty', 'E_CONTENT_EMPTY', `The document at path ${pluginConfig.documentPath} was empty`);

  try {
    await util.promisify(confluence.putContent).call(confluence, docData.space, pluginConfig.documentID, docData.version + 1, docData.title, documentContent);
  } catch (error) {
    throw [
      new SemanticReleaseError('Error publishing content', 'E_PUBLISH', 'There was an error publishing the content to confluence'),
      error
    ];
  }

  logger.info('Content published.');
}


module.exports = {
  verifyConditions,
  publish
};
