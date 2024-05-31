import { Canvas } from '../../canvas/Canvas';
import { StaticCanvas } from '../../canvas/StaticCanvas';
import { ActiveSelection } from '../ActiveSelection';
import { Group } from '../Group';
import { FabricObject } from './FabricObject';

describe('StackedObject', () => {
  test('isDescendantOf', function () {
    const canvas = new Canvas();
    const object = new FabricObject();
    const parent = new Group([]);
    expect(typeof object.isDescendantOf === 'function').toBe(true);
    parent.canvas = canvas;
    object.parent = parent;
    expect(object.isDescendantOf(parent)).toBe(true);
    object.parent = new Group();
    object.parent.parent = parent;
    expect(object.isDescendantOf(parent)).toBe(true);
    expect(object.isDescendantOf(canvas)).toBe(true);
    object.parent = undefined;
    expect(object.isDescendantOf(parent) === false).toBe(true);
    expect(object.isDescendantOf(canvas) === false).toBe(true);
    object.canvas = canvas;
    expect(object.isDescendantOf(canvas)).toBe(true);
    expect(object.isDescendantOf(object) === false).toBe(true);
    object.parent = parent;
    const activeSelection = new ActiveSelection([object], { canvas });
    expect(object.group).toEqual(activeSelection);
    expect(object.parent).toEqual(parent);
    expect(object.canvas).toEqual(canvas);
    expect(object.isDescendantOf(parent));
    expect(object.isDescendantOf(activeSelection)).toBe(true);
    expect(object.isDescendantOf(canvas));
    delete object.parent;
    expect(!object.isDescendantOf(parent));
    expect(object.isDescendantOf(activeSelection)).toBe(true);
    expect(object.isDescendantOf(canvas)).toBe(true);
  });

  test('getAncestors return type', () => {
    const object = new FabricObject();

    const parents: Group[] = object.getAncestors(true);

    const isCanvas = (a: unknown): a is Canvas | StaticCanvas =>
      a instanceof Canvas || a instanceof StaticCanvas;
    const isGroup = (a: unknown): a is Group => a instanceof Group;

    const ancestors = object.getAncestors(false);
    const parentAncestors: Group[] = ancestors.filter(isGroup);
    const canvasAncestor: Canvas | StaticCanvas = ancestors.filter(isCanvas)[0];

    expect(parents).toBeDefined();
    expect(parentAncestors).toBeDefined();
    expect(canvasAncestor).toBeDefined();
  });

  test('getAncestors', () => {
    const canvas = new Canvas();
    const object = new FabricObject();
    const parent = new Group([]);
    const other = new Group();

    expect(object.getAncestors()).toEqual([]);
    object.parent = parent;
    expect(object.getAncestors()).toEqual([parent]);
    expect<Group[]>(object.getAncestors(true)).toEqual([parent]);
    parent.canvas = canvas;
    expect(object.getAncestors()).toEqual([parent, canvas]);
    parent.parent = other;
    expect(object.getAncestors()).toEqual([parent, other]);
    other.canvas = canvas;
    expect(object.getAncestors()).toEqual([parent, other, canvas]);
    delete object.parent;
    expect(object.getAncestors()).toEqual([]);
  });

  describe('findCommonAncestors', () => {
    class TestObject extends FabricObject {
      id: string;

      constructor({ id }: { id: string }) {
        super();
        this.id = id;
      }
    }
    class TestCollection extends Group {
      id: string;

      constructor({ id }: { id: string }) {
        super();
        this.id = id;
      }
    }
    class TestCanvas extends Canvas {
      id: string;

      constructor({ id }: { id: string }) {
        super();
        this.id = id;
      }
    }

    function prepareObjectsForTreeTesting() {
      return {
        object: new TestObject({ id: 'object' }),
        other: new TestObject({ id: 'other' }),
        a: new TestCollection({ id: 'a' }),
        b: new TestCollection({ id: 'b' }),
        c: new TestCollection({ id: 'c' }),
        canvas: new TestCanvas({ id: 'canvas' }),
      };
    }

    const getId = (obj: unknown) =>
      (obj as TestObject | TestCollection | TestCanvas).id;

    function findCommonAncestors(
      object: TestObject,
      other: TestObject,
      strict: boolean,
      expected: ReturnType<typeof FabricObject.prototype.findCommonAncestors>
    ) {
      const common = object.findCommonAncestors(other, strict);
      expect(common.fork.map(getId)).toEqual(expected.fork.map(getId));
      expect(common.otherFork.map(getId)).toEqual(
        expected.otherFork.map(getId)
      );
      expect(common.common.map(getId)).toEqual(expected.common.map(getId));
      const oppositeCommon = other.findCommonAncestors(object, strict);
      expect(oppositeCommon.fork.map(getId)).toEqual(
        expected.otherFork.map(getId)
      );
      expect(oppositeCommon.otherFork.map(getId)).toEqual(
        expected.fork.map(getId)
      );
      expect(oppositeCommon.common.map(getId)).toEqual(
        expected.common.map(getId)
      );
    }
    const { object, other, a, b, c, canvas } = prepareObjectsForTreeTesting();
    it('should be a function', () => {
      expect(typeof object.findCommonAncestors).toBe('function');
    });
    it('_objects should be an array', () => {
      expect(Array.isArray(a._objects)).toBe(true);
    });
    it('_objects should be different', () => {
      expect(a._objects).not.toBe(b._objects);
    });
    // same object
    findCommonAncestors(object, object, false, {
      fork: [],
      otherFork: [],
      common: [object],
    });
    // foreign objects
    findCommonAncestors(object, other, false, {
      fork: [object],
      otherFork: [other],
      common: [],
    });
    // same level
    a.add(object, other);
    findCommonAncestors(object, other, false, {
      fork: [object],
      otherFork: [other],
      common: [a],
    });
    findCommonAncestors(object, a, false, {
      fork: [object],
      otherFork: [],
      common: [a],
    });
    findCommonAncestors(other, a, false, {
      fork: [other],
      otherFork: [],
      common: [a],
    });
    findCommonAncestors(a, object, false, {
      fork: [],
      otherFork: [object],
      common: [a],
    });
    findCommonAncestors(a, object, true, {
      fork: [],
      otherFork: [object],
      common: [a],
    });
    // different level
    a.remove(object);
    b.add(object);
    a.add(b);
    findCommonAncestors(object, b, false, {
      fork: [object],
      otherFork: [],
      common: [b, a],
    });
    findCommonAncestors(b, a, false, { fork: [b], otherFork: [], common: [a] });
    findCommonAncestors(object, other, false, {
      fork: [object, b],
      otherFork: [other],
      common: [a],
    });
    // with common ancestor
    expect(c.size()).toBe(0);
    c.add(a);
    expect(c.size()).toBe(1);
    findCommonAncestors(object, b, false, {
      fork: [object],
      otherFork: [],
      common: [b, a, c],
    });
    findCommonAncestors(b, a, false, {
      fork: [b],
      otherFork: [],
      common: [a, c],
    });
    findCommonAncestors(object, other, false, {
      fork: [object, b],
      otherFork: [other],
      common: [a, c],
    });
    findCommonAncestors(object, c, false, {
      fork: [object, b, a],
      otherFork: [],
      common: [c],
    });
    findCommonAncestors(other, c, false, {
      fork: [other, a],
      otherFork: [],
      common: [c],
    });
    findCommonAncestors(b, c, false, {
      fork: [b, a],
      otherFork: [],
      common: [c],
    });
    findCommonAncestors(a, c, false, { fork: [a], otherFork: [], common: [c] });
    //  deeper asymmetrical
    c.removeAll();
    expect(c.size()).toBe(0);
    a.remove(other);
    c.add(other, a);
    findCommonAncestors(object, b, false, {
      fork: [object],
      otherFork: [],
      common: [b, a, c],
    });
    findCommonAncestors(b, a, false, {
      fork: [b],
      otherFork: [],
      common: [a, c],
    });
    findCommonAncestors(a, other, false, {
      fork: [a],
      otherFork: [other],
      common: [c],
    });
    findCommonAncestors(object, other, false, {
      fork: [object, b, a],
      otherFork: [other],
      common: [c],
    });
    findCommonAncestors(object, c, false, {
      fork: [object, b, a],
      otherFork: [],
      common: [c],
    });
    findCommonAncestors(other, c, false, {
      fork: [other],
      otherFork: [],
      common: [c],
    });
    findCommonAncestors(b, c, false, {
      fork: [b, a],
      otherFork: [],
      common: [c],
    });
    findCommonAncestors(a, c, false, {
      fork: [a],
      otherFork: [],
      common: [c],
    });
    //  with canvas
    a.removeAll();
    b.removeAll();
    c.removeAll();
    canvas.add(object, other);
    findCommonAncestors(object, other, true, {
      fork: [object],
      otherFork: [other],
      common: [],
    });
    findCommonAncestors(object, other, false, {
      fork: [object],
      otherFork: [other],
      common: [canvas],
    });
    // findCommonAncestors(object, canvas, true, {
    //   fork: [object],
    //   otherFork: [canvas],
    //   common: [],
    // });
    // findCommonAncestors(object, canvas, false, {
    //   fork: [object],
    //   otherFork: [],
    //   common: [canvas],
    // });
    // findCommonAncestors(other, canvas, false, {
    //   fork: [other],
    //   otherFork: [],
    //   common: [canvas],
    // });
  });
});
