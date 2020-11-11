// @flow

/*::
import type { EslintRule } from '@adeira/flow-types-eslint';
*/

const getImportSpecifiers = require('./utils/getImportSpecifiers');
const isSXVariableDeclarator = require('./utils/isSXVariableDeclarator');

// This rule makes sure that all defined stylesheets are used AND all used stylesheets are defined.
module.exports = ({
  create: function (context) {
    // import * as sx from '@adeira/sx'
    //             ^^
    let importNamespaceSpecifier = null;

    // import { create as sxCreate } from '@adeira/sx';
    //                    ^^^^^^^^
    let importSpecifier = null;

    // stylesheet names which were defined via `sx.create`
    // const xxx = sx.create({yyy, zzz})   =>   Map([["xxx", ["yyy", "zzz"]]])
    const definedStylesheetNames = new Map();

    // xxx('aaa', 'bbb')   =>   Map([["xxx", [aaaNode, bbbNode]]])
    const usedStylesheetNames = new Map();

    let unableToAnalyzeUsedStylesheets = false;

    return {
      // TODO: add support for `require("@adeira/sx")`
      'ImportDeclaration'(node) {
        const { importNamespaceSpecifier: _ins, importSpecifier: _is } = getImportSpecifiers(node);
        importNamespaceSpecifier = _ins;
        importSpecifier = _is;
      },

      // const styles = sx.create({})
      //       ^^^^^^^^^^^^^^^^^^^^^^
      //       | id |
      'VariableDeclarator'(node) {
        if (isSXVariableDeclarator(node, importNamespaceSpecifier, importSpecifier)) {
          const initArguments = (node.init && node.init.arguments) || [];

          if (initArguments.length > 1) {
            context.report({
              node,
              message: 'SX create was called with too many arguments. Only one is allowed.',
            });
          }

          const firstArgument = initArguments[0];
          if ((firstArgument && firstArgument.type) !== 'ObjectExpression') {
            context.report({
              node,
              message: 'SX create must be called with object in a first argument.',
            });
          }

          const firstArgumentProperties = (firstArgument && firstArgument.properties) || [];
          for (const property of firstArgumentProperties) {
            if (property.value.type !== 'ObjectExpression') {
              context.report({
                node,
                message: 'Each SX definition property must be an object.',
              });
            }

            const alreadyCaptured = definedStylesheetNames.get(node.id.name) || [];
            definedStylesheetNames.set(node.id.name, [
              ...alreadyCaptured,
              property.key.name || // in case property is type of "Identifier"
                property.key.value, // in case property is type of "Literal"
            ]);
          }
        }
      },

      // className={styles('aaa')}
      //           ^^^^^^^^^^^^^^^
      'JSXExpressionContainer'(node) {
        const usedNames = new Set();
        const expressionArguments = node.expression.arguments || [];
        if (expressionArguments.length === 0) {
          // some unexpected "className" construct
          unableToAnalyzeUsedStylesheets = true;
        }
        for (const argument of expressionArguments) {
          if (argument.type === 'Literal') {
            usedNames.add(argument.value);
          } else if (argument.type === 'TemplateLiteral') {
            usedNames.add(argument.quasis[0].value.raw);
          } else if (argument.type === 'LogicalExpression') {
            usedNames.add(argument.right.value);
          } else {
            // TODO: more cases (deeper analysis)
            unableToAnalyzeUsedStylesheets = true;
          }
        }

        if (node.expression.callee) {
          const maybeCaptured = usedStylesheetNames.get(node.expression.callee.name);
          const alreadyCaptured = maybeCaptured ? maybeCaptured : [];
          usedStylesheetNames.set(node.expression.callee.name, [...alreadyCaptured, ...usedNames]);
        }
      },

      'Program:exit'(node) {
        if (unableToAnalyzeUsedStylesheets === true) {
          // backout early in cases we are not 100% sure about it
          return;
        }

        definedStylesheetNames.forEach((definedNames, callee) => {
          const usedNames = usedStylesheetNames.get(callee);
          if (usedNames == null) {
            context.report({
              node, // TODO: improve the location by using more accurate node (?)
              message: 'SX function "{{functionName}}" was not used anywhere in JSX.',
              data: { functionName: callee },
            });
          }

          const definedButNotUsed =
            definedNames.filter((name) => {
              return !(usedNames && usedNames.includes(name));
            }) || [];
          for (const name of definedButNotUsed) {
            context.report({
              node, // TODO: improve the location by using more accurate node (?)
              message:
                'Unused stylesheet: {{stylesheetName}} (defined via "{{definedBy}}" variable)',
              data: {
                stylesheetName: name,
                definedBy: callee,
              },
            });
          }

          const usedButNotDefined =
            (usedNames &&
              usedNames.filter((name) => {
                return !(definedNames && definedNames.includes(name));
              })) ||
            [];
          for (const name of usedButNotDefined) {
            context.report({
              node, // TODO: improve the location by using more accurate node (?)
              message: 'Unknown stylesheet used: {{stylesheetName}} (not defined anywhere)',
              data: {
                stylesheetName: name,
              },
            });
          }
        });
      },
    };
  },
} /*: EslintRule */);
