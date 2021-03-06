const debug = require('debug')('semantic-release-confluence:index');
const getLogger = require('./get-logger');
const SemanticReleaseError = require('@semantic-release/error');
const fs = require('fs');
const path = require('path');
const Confluence = require('confluence-api');
const util = require('util');
const {isString} = require('lodash');

let documentVersion = null;
let documentSpace = null;
let documentTitle = null;


async function verifyConditions(pluginConfig, context) {
  const logger = getLogger(context);
  const env = context.env;

  if(!env.CONFLUENCE_USERNAME || !env.CONFLUENCE_USERNAME.trim())
    throw new SemanticReleaseError('CONFLUENCE_USERNAME not provided', 'E_MISSING_CUSERNAME', 'The environment variable "CONFLUENCE_USERNAME" must be provided.');

  if(!env.CONFLUENCE_TOKEN || !env.CONFLUENCE_TOKEN.trim())
    throw new SemanticReleaseError('CONFLUENCE_TOKEN not provided', 'E_MISSING_CTOKEN', 'The environment variable "CONFLUENCE_TOKEN" must be provided.');

  if(!pluginConfig.baseUrl
      || (typeof pluginConfig.baseUrl != 'string')
      || !pluginConfig.baseUrl.trim()) {
    throw new SemanticReleaseError('baseUrl not provided', 'E_MISSING_BASE_URL', 'Must supply an baseUrl in the plugin config.');
  }

  if(!pluginConfig.documentID
      || (typeof pluginConfig.documentID != 'string')
      || !pluginConfig.documentID.trim()) {
    throw new SemanticReleaseError('documentID not provided', 'E_MISSING_DOC_ID', 'Must supply a documentID in the plugin config.');
  }

  if(!pluginConfig.documentPath
      || (typeof pluginConfig.documentPath != 'string')
      || !pluginConfig.documentPath.trim()) {
    throw new SemanticReleaseError('documentPath not provided', 'E_MISSING_PATH', 'Must supply a documentPath in the plugin config.');
  }

  let exists = false;
  try {
    exists = fs.existsSync(path.resolve(context.cwd, pluginConfig.documentPath));
  } catch(error) {
    logger.fatal(`There was an error determining if the path at ${pluginConfig.documentPath} exists.`);
    throw [SemanticReleaseError('Error determing documentPath existence', 'E_DOC_FS_EXISTS', `There was an error while trying to determine the existence of ${pluginConfig.documentPath}`), error];
  }

  if(!exists) {
    throw new SemanticReleaseError('File at documentPath does not exist', 'E_DOC_EXISTS', `The document at ${pluginConfig.documentPath} does not exist`);
  }

  const confluence = new Confluence({
    username: env.CONFLUENCE_USERNAME,
    password: env.CONFLUENCE_TOKEN,
    baseUrl: pluginConfig.baseUrl
  });

  let documentData = null;
  try {
    documentData = await util.promisify(confluence.getCustomContentById).call(confluence, {id: pluginConfig.documentID, expanders: ['space','version']});
  } catch(error) {
    logger.fatal(`There was an error while trying to determine the existence of document ${pluginConfig.documentID}`);
    throw [new SemanticReleaseError('Error determining document existence', 'E_DET_DOC_EXISTS_REMOTE', `There was an error while trying to determine the exist of a document with ID ${pluginConfig.documentID}`), error];
  }

  if(!documentData)
    throw new SemanticReleaseError('No document data', 'E_DOC_NO_DATA', `No data was returned while retrieving data for the document with ID ${pluginConfig.documentID}`);

  try {
    documentVersion = Number.parseInt(documentData.version.number);
  } catch(error) {
    throw [
      new SemanticReleaseError('Document version parse error', 'E_DOC_VERSION_PARSE', `The document version for ID ${pluginConfig.documentID} could not be parsed`),
      error
    ];
  }

  documentSpace = documentData.space.key;
  documentTitle = documentData.title;

  logger.info('Configuration is valid.');

}

async function publish(pluginConfig, context) {
  const logger = getLogger(context);
  const env = context.env;
  logger.info('Publishing to confluence...');

  const confluence = new Confluence({
    username: env.CONFLUENCE_USERNAME,
    password: env.CONFLUENCE_TOKEN,
    baseUrl: pluginConfig.baseUrl
  });

  let documentContent = null;
  try {
    documentContent = fs.readFileSync(pluginConfig.documentPath, 'utf-8');
  } catch(error) {
    throw [
      new SemanticReleaseError('Error loading content', 'E_CONTENT', `There was an error loading the content at path ${pluginConfig.documentPath}`),
      error
    ];
  }

  if(!documentContent || !isString(documentContent) || !documentContent.trim())
    throw new SemanticReleaseError('Document empty', 'E_CONTENT_EMPTY', `The document at path ${pluginConfig.documentPath} was empty`);

  try {
    await util.promisify(confluence.putContent).call(confluence, documentSpace, pluginConfig.documentID, documentVersion + 1, documentTitle, documentContent);
  } catch(error) {
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
