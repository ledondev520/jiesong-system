import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Command, CommandInput } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const SOURCE_ROOT = path.resolve(process.cwd(), 'src');
const AUDIT_DIRS = ['app', 'components'];
const IGNORED_FILES = new Set([
  path.join('components', 'ui', 'command.tsx'),
  path.join('components', 'ui', 'input.tsx'),
  path.join('components', 'ui', 'textarea.tsx'),
]);
const TARGET_TAGS = new Set(['input', 'textarea', 'select']);

type Violation = {
  file: string;
  line: number;
  tag: string;
};

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    if (!/\.(t|j)sx$/.test(entry) || /\.test\.(t|j)sx$/.test(entry)) {
      return [];
    }

    return [fullPath];
  });
}

function getTagName(
  node: ts.JsxTagNameExpression | ts.JsxOpeningFragment
): string | null {
  if (ts.isIdentifier(node)) {
    return node.text;
  }

  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }

  return null;
}

function isFormControlAncestor(ancestors: string[]): boolean {
  return ancestors.includes('FormControl');
}

function hasIdOrName(attributes: ts.JsxAttributes): boolean {
  return attributes.properties.some((prop) => {
    if (!ts.isJsxAttribute(prop)) {
      return false;
    }

    if (ts.isIdentifier(prop.name)) {
      return prop.name.text === 'id' || prop.name.text === 'name';
    }

    return false;
  });
}

function collectViolations(filePath: string): Violation[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];

  const visit = (node: ts.Node, ancestors: string[]) => {
    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagName(node.tagName);

      if (
        tagName &&
        TARGET_TAGS.has(tagName) &&
        !hasIdOrName(node.attributes) &&
        !isFormControlAncestor(ancestors)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        violations.push({
          file: path.relative(SOURCE_ROOT, filePath),
          line: line + 1,
          tag: tagName,
        });
      }
    }

    if (ts.isJsxElement(node)) {
      const tagName = getTagName(node.openingElement.tagName);
      const nextAncestors = tagName ? [...ancestors, tagName] : ancestors;
      ts.forEachChild(node, (child) => visit(child, nextAncestors));
      return;
    }

    ts.forEachChild(node, (child) => visit(child, ancestors));
  };

  visit(sourceFile, []);
  return violations;
}

describe('form field identity guardrails', () => {
  it('Input/Textarea/CommandInput 在未显式传入 id 时会自动生成稳定 id', () => {
    render(
      <>
        <Input aria-label="普通输入" />
        <Textarea aria-label="多行输入" />
        <Command>
          <CommandInput aria-label="命令搜索" />
        </Command>
      </>
    );

    expect(screen.getByLabelText('普通输入')).toHaveAttribute('id');
    expect(screen.getByLabelText('多行输入')).toHaveAttribute('id');
    expect(screen.getByLabelText('命令搜索')).toHaveAttribute('id');
  });

  it('原生表单字段必须显式提供 id 或 name，避免绕过共享组件兜底', () => {
    const violations = AUDIT_DIRS.flatMap((dir) => listSourceFiles(path.join(SOURCE_ROOT, dir)))
      .filter((filePath) => !IGNORED_FILES.has(path.relative(SOURCE_ROOT, filePath)))
      .flatMap((filePath) => collectViolations(filePath));

    expect(
      violations,
      violations.length === 0
        ? 'all raw native form fields declare id/name'
        : `missing id/name:\n${violations
            .map((violation) => `${violation.file}:${violation.line} <${violation.tag}>`)
            .join('\n')}`
    ).toEqual([]);
  });
});
