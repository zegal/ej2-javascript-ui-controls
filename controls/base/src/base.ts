import { isUndefined, isNullOrUndefined, merge, setImmediate, setValue, isBlazor, getValue, extend } from './util';
import { addClass, removeClass } from './dom';
import { Observer } from './observer';

export interface DomElements extends HTMLElement {
    // eslint-disable-next-line
    ej2_instances: Object[];
}

const isColEName: RegExp = new RegExp(']');

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AngularEventEmitter {
    subscribe?: (generatorOrNext?: any, error?: any, complete?: any) => any;
}

export declare type EmitType<T> = AngularEventEmitter & ((arg?: any, ...rest: any[]) => void);

export interface BlazorDotnetObject {
    dispose(): void;
    invokeMethod(methodName: string): void;
    invokeMethodAsync(methodName: string, ...args: any[]): void;
}
/* tslint:enable:no-any */


/**
 * Base library module is common module for Framework modules like touch,keyboard and etc.,
 *
 * @private
 */
export abstract class Base<ElementType extends HTMLElement> {
    public element: ElementType;
    public isDestroyed: boolean;
    protected isRendered: boolean = false;
    protected isComplexArraySetter: boolean = false;
    public isServerRendered: boolean = false;
    public allowServerDataBinding: boolean = true;
    protected isProtectedOnChange: boolean = true;
    protected properties: { [key: string]: Object } = {};
    protected changedProperties: { [key: string]: Object } = {};
    protected oldProperties: { [key: string]: Object } = {};
    protected bulkChanges: { [key: string]: Object } = {};
    protected refreshing: boolean = false;
    public ignoreCollectionWatch : boolean = false;
    // eslint-disable-next-line
    protected finalUpdate: Function = (): void => { };
    protected modelObserver: Observer;
    protected childChangedProperties: { [key: string]: Object } = {};
    protected abstract getModuleName(): string;
    protected abstract onPropertyChanged(newProperties: Object, oldProperties?: Object): void;
    /** Property base section */
    /**
     * Function used to set bunch of property at a time.
     *
     * @private
     * @param  {Object} prop - JSON object which holds components properties.
     * @param  {boolean} muteOnChange ? - Specifies to true when we set properties.
     * @returns {void} ?
     */
    public setProperties(prop: Object, muteOnChange?: boolean): void {
        const prevDetection: boolean = this.isProtectedOnChange;
        this.isProtectedOnChange = !!muteOnChange;
        merge(this, prop);
        if (muteOnChange !== true) {
            merge(this.changedProperties, prop);
            this.dataBind();
        } else if (isBlazor() && this.isRendered) {
            this.serverDataBind(prop);
        }
        this.finalUpdate();
        this.changedProperties = {};
        this.oldProperties = {};
        this.isProtectedOnChange = prevDetection;
    }
    /**
     * Calls for child element data bind
     *
     * @param {Object} obj ?
     * @param {Object} parent ?
     * @returns {void} ?
     */
    // tslint:disable-next-line:no-any
    private static callChildDataBind(obj: Object, parent: { [key: string]: any }): void {
        const keys: string[] = Object.keys(obj);
        for (const key of keys) {
            if (parent[key] instanceof Array) {
                for (const obj of parent[key]) {
                    if (obj.dataBind !== undefined) {
                        obj.dataBind();
                    }
                }
            } else {
                parent[key].dataBind();
            }
        }
    }

    protected clearChanges(): void {
        this.finalUpdate();
        this.changedProperties = {};
        this.oldProperties = {};
        this.childChangedProperties = {};
    }

    /**
     * Bind property changes immediately to components
     *
     * @returns {void} ?
     */
    public dataBind(): void {
        Base.callChildDataBind(this.childChangedProperties, this);
        if (Object.getOwnPropertyNames(this.changedProperties).length) {
            const prevDetection: boolean = this.isProtectedOnChange;
            const newChanges: Object = this.changedProperties;
            const oldChanges: Object = this.oldProperties;
            this.clearChanges();
            this.isProtectedOnChange = true;
            this.onPropertyChanged(newChanges, oldChanges);
            this.isProtectedOnChange = prevDetection;
        }
    }

    /* tslint:disable:no-any */
    public serverDataBind(newChanges?: { [key: string]: any }): void {
        if (!isBlazor()) {
            return;
        }
        newChanges = newChanges ? newChanges : {};
        extend(this.bulkChanges, {}, newChanges, true);
        const sfBlazor: string = 'sfBlazor';
        if (this.allowServerDataBinding && (window as any)[sfBlazor].updateModel) {
            (window as any)[sfBlazor].updateModel(this);
            this.bulkChanges = {};
        }
    }
    /* tslint:enable:no-any */

    protected saveChanges(key: string, newValue: string, oldValue: string): void {
        if (isBlazor()) {
            // tslint:disable-next-line:no-any
            const newChanges: any = {};
            newChanges[key] = newValue;
            this.serverDataBind(newChanges);
        }
        if (this.isProtectedOnChange) {
            return;
        }
        this.oldProperties[key] = oldValue;
        this.changedProperties[key] = newValue;
        this.finalUpdate();
        this.finalUpdate = setImmediate(this.dataBind.bind(this));
    }

    /** Event Base Section */
    /**
     * Adds the handler to the given event listener.
     *
     * @param {string} eventName - A String that specifies the name of the event
     * @param {Function} handler - Specifies the call to run when the event occurs.
     * @returns {void} ?
     */
    public addEventListener(eventName: string, handler: Function): void {
        this.modelObserver.on(eventName, handler);
    }

    /**
     * Removes the handler from the given event listener.
     *
     * @param {string} eventName - A String that specifies the name of the event to remove
     * @param {Function} handler - Specifies the function to remove
     * @returns {void} ?
     */
    public removeEventListener(eventName: string, handler: Function): void {
        this.modelObserver.off(eventName, handler);
    }
    /**
     * Triggers the handlers in the specified event.
     *
     * @private
     * @param {string} eventName - Specifies the event to trigger for the specified component properties.
     * Can be a custom event, or any of the standard events.
     * @param {Event} eventProp - Additional parameters to pass on to the event properties
     * @param {Function} successHandler - this function will invoke after event successfully triggered
     * @param {Function} errorHandler - this function will invoke after event if it failured to call.
     * @returns {void} ?
     */
    public trigger(
        eventName: string,
        eventProp?: Object,
        successHandler?: Function,
        errorHandler?: Function): void | object {
        if (this.isDestroyed !== true) {
            const prevDetection: boolean = this.isProtectedOnChange;
            this.isProtectedOnChange = false;
            let data: object = this.modelObserver.notify(eventName, eventProp, successHandler, errorHandler) as object;
            if (isColEName.test(eventName)) {
                const handler: Function = getValue(eventName, this);
                if (handler) {
                    const blazor: string = 'Blazor';
                    if (window[blazor]) {
                        const promise: Promise<object> = handler.call(this, eventProp);
                        if (promise && typeof promise.then === 'function') {
                            if (!successHandler) {
                                data = promise;
                            } else {
                                promise.then((data: object) => {
                                    if (successHandler) {
                                        data = typeof data === 'string' && this.modelObserver.isJson(data) ?
                                            JSON.parse(data as string) : data;
                                        successHandler.call(this, data);
                                    }
                                }).catch((data: object) => {
                                    if (errorHandler) {
                                        data = typeof data === 'string' && this.modelObserver.isJson(data) ? JSON.parse(data) : data;
                                        errorHandler.call(this, data);
                                    }
                                });
                            }
                        } else if (successHandler) {
                            successHandler.call(this, eventProp);
                        }
                    } else {
                        handler.call(this, eventProp);
                        if (successHandler) {
                            successHandler.call(this, eventProp);
                        }
                    }
                } else if (successHandler) {
                    successHandler.call(this, eventProp);
                }
            }
            this.isProtectedOnChange = prevDetection;
            return data;
        }
    }

    /**
     * Base constructor accept options and element
     *
     * @param {Object} options ?
     * @param {string} element ?
     */
    constructor(options: Object, element: ElementType | string) {
        this.modelObserver = new Observer(this);
        if (!isUndefined(element)) {
            if ('string' === typeof (element)) {
                this.element = <ElementType>document.querySelector(<string>element);
            } else {
                this.element = <ElementType>element;
            }
            if (!isNullOrUndefined(this.element)) {
                this.isProtectedOnChange = false;
                this.addInstance();
            }
        }
        if (!isUndefined(options)) {
            this.setProperties(options, true);
        }
        this.isDestroyed = false;
    }

    /**
     * To maintain instance in base class
     *
     * @returns {void} ?
     */
    protected addInstance(): void {
        // Add module class to the root element
        const moduleClass: string = 'e-' + this.getModuleName().toLowerCase();
        addClass([this.element], ['e-lib', moduleClass]);
        if (!isNullOrUndefined((<DomElements>(this.element as HTMLElement)).ej2_instances)) {
            (<DomElements>(this.element as HTMLElement)).ej2_instances.push(this);
        } else {
            setValue('ej2_instances', [this], (<DomElements>(this.element as HTMLElement)));
        }
    }
    /**
     * To remove the instance from the element
     *
     * @returns {void} ?
     */
    protected destroy(): void {
        // eslint-disable-next-line
        (<DomElements>(this.element as HTMLElement)).ej2_instances =
            (<DomElements>(this.element as HTMLElement)).ej2_instances.filter((i: Object) => { return i !== this; });
        removeClass([this.element], ['e-' + this.getModuleName()]);
        if ((<DomElements>(this.element as HTMLElement)).ej2_instances.length === 0) {
            // Remove module class from the root element
            removeClass([this.element], ['e-lib']);
        }
        this.clearChanges();
        this.modelObserver.destroy();
        this.isDestroyed = true;
    }
}

/**
 * Global function to get the component instance from the rendered element.
 *
 * @param {HTMLElement} elem Specifies the HTMLElement or element id string.
 * @param {string} comp Specifies the component module name or Component.
 * @returns {any} ?
 */
// tslint:disable-next-line:no-any
export function getComponent<T>(elem: HTMLElement | string, comp: string | any | T): T {
    let instance: T;
    let i: number;
    const ele: HTMLElement = typeof elem === 'string' ? document.getElementById(elem) : elem;
    for (i = 0; i < (<DomElements>(ele as HTMLElement)).ej2_instances.length; i++) {
        instance = <T>(ele as DomElements).ej2_instances[i];
        if (typeof comp === 'string') {
            const compName: string = (instance as { getModuleName: () => string } & T).getModuleName();
            if (comp === compName) {
                return instance;
            }
        } else {
            // tslint:disable-next-line:no-any
            if (instance instanceof <any>comp) {
                return instance;
            }
        }
    }
    return undefined;
}

/**
 * Function to remove the child instances.
 *
 * @param {HTMLElement} element ?
 * @return {void}
 * @private
 */
// tslint:disable-next-line:no-any
export function removeChildInstance(element: HTMLElement): void {
    // tslint:disable-next-line:no-any
    const childEle: any = [].slice.call(element.getElementsByClassName('e-control'));
    for (let i: number = 0; i < childEle.length; i++) {
        const compName: string = childEle[i].classList[1].split('e-')[1];
        // tslint:disable-next-line:no-any
        const compInstance: any = getComponent(childEle[i], compName);
        if (!isUndefined(compInstance)) {
            compInstance.destroy();
        }
    }
}
