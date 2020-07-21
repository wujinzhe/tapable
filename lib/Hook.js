/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const util = require("util");

const deprecateContext = util.deprecate(() => {},
"Hook.context is deprecated and will be removed");

const CALL_DELEGATE = function(...args) {
	this.call = this._createCall("sync");
	return this.call(...args);
};
const CALL_ASYNC_DELEGATE = function(...args) {
	this.callAsync = this._createCall("async");
	return this.callAsync(...args);
};
const PROMISE_DELEGATE = function(...args) {
	this.promise = this._createCall("promise");
	return this.promise(...args);
};

class Hook {
	constructor(args = [], name = undefined) {
		this._args = args;
		this.name = name;
		this.taps = [];
		this.interceptors = [];
		this._call = CALL_DELEGATE;
		this.call = CALL_DELEGATE;
		this._callAsync = CALL_ASYNC_DELEGATE;
		this.callAsync = CALL_ASYNC_DELEGATE;
		this._promise = PROMISE_DELEGATE;
		this.promise = PROMISE_DELEGATE;
		this._x = undefined;

		this.compile = this.compile; // 初始化基类的方法，后续再子类中重新赋值
		this.tap = this.tap;
		this.tapAsync = this.tapAsync;
		this.tapPromise = this.tapPromise;
	}

	compile(options) {
		throw new Error("Abstract: should be overridden");
	}

	/**
	 * 
	 * 这个方法，让不同的子类可以实现不同的逻辑，当进行事件触发的时候
	 */
	_createCall(type) {
		/**
		 * this.compile使用子类赋值后的值
		 */
		return this.compile({
			taps: this.taps,
			interceptors: this.interceptors,
			args: this._args,
			type: type
		});
	}

	/** 监听不同的事件流
	 * type 事件流类型
	 * options 选项
	 * fn 触发的回调函数
	 * 
	 * options 可以是字符串'xxx'  也可以是对象{ name: 'xxx' }
	 */
	_tap(type, options, fn) {
		if (typeof options === "string") {
			options = {
				name: options
			};
		} else if (typeof options !== "object" || options === null) {
			throw new Error("Invalid tap options");
		}
		if (typeof options.name !== "string" || options.name === "") {
			throw new Error("Missing name for tap");
		}
		if (typeof options.context !== "undefined") {
			deprecateContext();
		}
		options = Object.assign({ type, fn }, options); // 把多个参数都整合成一个对象

		/** 把参数用拦截器进行包裹，然后返回，这样触发事件的时候会先进入到拦截器中 */
		options = this._runRegisterInterceptors(options);

		// 将事件插入到事件流中（taps）
		this._insert(options);
	}

	/** 处理同步事件 */
	tap(options, fn) {
		this._tap("sync", options, fn);
	}

	/** 处理异步事件 */
	tapAsync(options, fn) {
		this._tap("async", options, fn);
	}

	/** 处理promise事件 */
	tapPromise(options, fn) {
		this._tap("promise", options, fn);
	}

	/** 注册拦截器 */
	_runRegisterInterceptors(options) {
		for (const interceptor of this.interceptors) {
			if (interceptor.register) {
				const newOptions = interceptor.register(options);
				if (newOptions !== undefined) {
					options = newOptions;
				}
			}
		}
		return options;
	}

	withOptions(options) {
		const mergeOptions = opt =>
			Object.assign({}, options, typeof opt === "string" ? { name: opt } : opt);

		return {
			name: this.name,
			tap: (opt, fn) => this.tap(mergeOptions(opt), fn),
			tapAsync: (opt, fn) => this.tapAsync(mergeOptions(opt), fn),
			tapPromise: (opt, fn) => this.tapPromise(mergeOptions(opt), fn),
			intercept: interceptor => this.intercept(interceptor),
			isUsed: () => this.isUsed(),
			withOptions: opt => this.withOptions(mergeOptions(opt))
		};
	}

	isUsed() {
		return this.taps.length > 0 || this.interceptors.length > 0;
	}

	intercept(interceptor) {
		this._resetCompilation();
		this.interceptors.push(Object.assign({}, interceptor));
		if (interceptor.register) {
			for (let i = 0; i < this.taps.length; i++) {
				this.taps[i] = interceptor.register(this.taps[i]);
			}
		}
	}

	_resetCompilation() {
		this.call = this._call;
		this.callAsync = this._callAsync;
		this.promise = this._promise;
	}

	_insert(item) {
		// 重置编译对象
		this._resetCompilation();

		/** before这个字段的作用是为了让某个触发（tap）可以在其它触发之前被执行
		 *  const calls = [];
				hook.tap("A", () => calls.push("A"));
				hook.tap(
					{
						name: "B",
						before: "A"
					},
					() => calls.push("B")
				);

				calls.length = 0;
				hook.call();
				expect(calls).toEqual(["B", "A"]);
		 */
		let before;
		if (typeof item.before === "string") {
			before = new Set([item.before]);
		} else if (Array.isArray(item.before)) {
			before = new Set(item.before);  // 去重的set
		}

		/** 也是用于tap（触发）的排序，默认为0，按照从小到大进行触发 */
		let stage = 0;
		if (typeof item.stage === "number") {
			stage = item.stage;
		}



		let i = this.taps.length;

		// 从最后一个tap开始
		while (i > 0) {
			i--;
			const x = this.taps[i]; // 最后一个元素和倒数第二个元素相等 [1, 1, 1, x, x]
			this.taps[i + 1] = x; // 添加一个新的，然后赋值为前一个
			const xStage = x.stage || 0;

			/**
			 * 当前需要添加进去的before
			 * 
			 * 这里处理的逻辑是比较before/stage，如果符合条件则是当前的对象和前一个进行交换位置
			 */
			if (before) {
				if (before.has(x.name)) {
					before.delete(x.name);
					continue;
				}
				if (before.size > 0) {
					continue;
				}
			}
			if (xStage > stage) {
				continue;
			}
			i++;
			break;
		}
		this.taps[i] = item;
	}
}

Object.setPrototypeOf(Hook.prototype, null);

module.exports = Hook;
