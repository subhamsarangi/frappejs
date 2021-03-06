const frappe = require('frappejs');

module.exports = class Database {
    constructor() {
        this.initTypeMap();
    }

    async connect() {
        // this.conn
    }

    close() {
        this.conn.close();
    }

    async migrate() {
        for (let doctype in frappe.models) {
            // check if controller module
            let meta = frappe.getMeta(doctype);
            if (!meta.isSingle) {
                if (await this.tableExists(doctype)) {
                    await this.alterTable(doctype);
                } else {
                    await this.createTable(doctype);
                }
            }
        }
        await this.commit();
    }

    async createTable(doctype) {
        let meta = frappe.getMeta(doctype);
        let columns = [];
        let values = [];

        for (let field of meta.getValidFields({ withChildren: false })) {
            if (this.type_map[field.fieldtype]) {
                columns.push(this.getColumnDefinition(field));
            }
        }

        return await this.runCreateTableQuery(doctype, columns, values);
    }

    async tableExists(table) {
        // return true if table exists
    }

    async runCreateTableQuery(doctype, columns, values) {
        // override
    }

    getColumnDefinition(df) {
        // return `${df.fieldname} ${this.type_map[df.fieldtype]} ${ ? "PRIMARY KEY" : ""} ${df.required && !df.default ? "NOT NULL" : ""} ${df.default ? `DEFAULT ${df.default}` : ""}`
    }

    async alterTable(doctype) {
        // get columns
        let tableColumns = await this.getTableColumns(doctype);
        let meta = frappe.getMeta(doctype);
        let values = [];

        for (let field of meta.getValidFields({ withChildren: false })) {
            if (!tableColumns.includes(field.fieldname) && this.type_map[field.fieldtype]) {
                values = []
                if (field.default) {
                    values.push(field.default);
                }
                await this.runAlterTableQuery(doctype, field, values);
            }
        }
    }

    async getTableColumns(doctype) {
        return [];
    }

    async runAlterTableQuery(doctype, field, values) {
        // alter table {doctype} add column ({column_def});
    }

    async get(doctype, name=null, fields = '*') {
        let meta = frappe.getMeta(doctype);
        let doc;
        if (meta.isSingle) {
            doc = await this.getSingle(doctype);
            doc.name = doctype;
        } else {
            if (!name) {
                throw new frappe.errors.ValueError('name is mandatory');
            }
            doc = await this.getOne(doctype, name, fields);
        }
        await this.loadChildren(doc, meta);
        return doc;
    }

    async loadChildren(doc, meta) {
        // load children
        let tableFields = meta.getTableFields();
        for (let field of tableFields) {
            doc[field.fieldname] = await this.getAll({
                doctype: field.childtype,
                fields: ["*"],
                filters: { parent: doc.name },
                order_by: 'idx',
                order: 'asc'
            });
        }
    }

    async getSingle(doctype) {
        let values = await this.getAll({
            doctype: 'SingleValue',
            fields: ['fieldname', 'value'],
            filters: { parent: doctype },
            order_by: 'fieldname',
            order: 'asc'
        });
        let doc = {};
        for (let row of values) {
            doc[row.fieldname] = row.value;
        }
        return doc;
    }

    async getOne(doctype, name, fields = '*') {
        // select {fields} form {doctype} where name = ?
    }

    prepareFields(fields) {
        if (fields instanceof Array) {
            fields = fields.join(", ");
        }
        return fields;
    }

    async insert(doctype, doc) {
        let meta = frappe.getMeta(doctype);

            // insert parent
        if (meta.isSingle) {
            await this.updateSingle(meta, doc, doctype);
        } else {
            await this.insertOne(doctype, doc);
        }

        // insert children
        await this.insertChildren(meta, doc, doctype);

        return doc;
    }

    async insertChildren(meta, doc, doctype) {
        let tableFields = meta.getTableFields();
        for (let field of tableFields) {
            let idx = 0;
            for (let child of (doc[field.fieldname] || [])) {
                this.prepareChild(doctype, doc.name, child, field, idx);
                await this.insertOne(field.childtype, child);
                idx++;
            }
        }
    }

    async insertOne(doctype, doc) {
        // insert into {doctype} ({fields}) values ({values})
    }

    async update(doctype, doc) {
        let meta = frappe.getMeta(doctype);

        // update parent
        if (meta.isSingle) {
            await this.updateSingle(meta, doc, doctype);
        } else {
            await this.updateOne(doctype, doc);
        }

        // insert or update children
        await this.updateChildren(meta, doc, doctype);
        return doc;
    }

    async updateChildren(meta, doc, doctype) {
        let tableFields = meta.getTableFields();
        for (let field of tableFields) {
            // first key is "parent" - for SQL params
            let added = [doc.name];
            for (let child of (doc[field.fieldname] || [])) {
                this.prepareChild(doctype, doc.name, child, field, added.length - 1);
                if (await this.exists(field.childtype, child.name)) {
                    await this.updateOne(field.childtype, child);
                }
                else {
                    await this.insertOne(field.childtype, child);
                }
                added.push(child.name);
            }
            await this.runDeleteOtherChildren(field, added);
        }
    }

    async updateOne(doctype, doc) {
        // update {doctype} set {field=value} where name=?
    }

    async runDeleteOtherChildren(field, added) {
        // delete from doctype where parent = ? and name not in (?, ?, ?)
    }

    async updateSingle(meta, doc, doctype) {
        await this.deleteSingleValues();
        for (let field of meta.getValidFields({withChildren: false})) {
            let value = doc[field.fieldname];
            if (value) {
                let singleValue = frappe.newDoc({
                    doctype: 'SingleValue',
                    parent: doctype,
                    fieldname: field.fieldname,
                    value: value
                })
                await singleValue.insert();
            }
        }
    }

    async deleteSingleValues(name) {
        // await frappe.db.run('delete from SingleValue where parent=?', name)
    }

    prepareChild(parenttype, parent, child, field, idx) {
        if (!child.name) {
            child.name = frappe.getRandomName();
        }
        child.parent = parent;
        child.parenttype = parenttype;
        child.parentfield = field.fieldname;
        child.idx = idx;
    }

    getKeys(doctype) {
        return frappe.getMeta(doctype).getValidFields({ withChildren: false });
    }

    getFormattedValues(fields, doc) {
        let values = fields.map(field => {
            let value = doc[field.fieldname];
            if (value instanceof Date) {
                if (field.fieldtype==='Date') {
                    // date
                    return value.toISOString().substr(0, 10);
                } else {
                    // datetime
                    return value.toISOString();
                }
            } else {
                return value;
            }
        });
        return values;
    }

    async deleteMany(doctype, names) {
        for (const name of names) {
            await this.delete(doctype, name);
        }
    }

    async delete(doctype, name) {
        await this.deleteOne(doctype, name);

        // delete children
        let tableFields = frappe.getMeta(doctype).getTableFields();
        for (let field of tableFields) {
            await this.deleteChildren(field.childtype, name);
        }
    }

    async deleteOne(doctype, name) {
        // delete from {doctype} where name = ?
    }

    async deleteChildren(parenttype, parent) {
        // delete from {parenttype} where parent = ?
    }

    async exists(doctype, name) {
        return (await this.getValue(doctype, name)) ? true : false;
    }

    async getValue(doctype, filters, fieldname = 'name') {
        if (typeof filters === 'string') {
            filters = { name: filters };
        }

        let row = await this.getAll({
            doctype: doctype,
            fields: [fieldname],
            filters: filters,
            start: 0,
            limit: 1,
            order_by: 'name',
            order: 'asc'
        });
        return row.length ? row[0][fieldname] : null;
    }

    getAll({ doctype, fields, filters, start, limit, order_by = 'modified', order = 'desc' } = {}) {
        // select {fields} from {doctype} where {filters} order by {order_by} {order} limit {start} {limit}
    }

    getFilterConditions(filters) {
        // {"status": "Open"} => `status = "Open"`
        // {"status": "Open", "name": ["like", "apple%"]}
        // => `status="Open" and name like "apple%"
        let conditions = [];
        let values = [];
        for (let key in filters) {
            const value = filters[key];
            if (value instanceof Array) {
                // if its like, we should add the wildcard "%" if the user has not added
                if (value[0].toLowerCase() === 'like' && !value[1].includes('%')) {
                    value[1] = `%${value[1]}%`;
                }
                conditions.push(`${key} ${value[0]} ?`);
                values.push(value[1]);
            } else {
                conditions.push(`${key} = ?`);
                values.push(value);
            }
        }
        return {
            conditions: conditions.length ? conditions.join(" and ") : "",
            values: values
        };
    }

    async run(query, params) {
        // run query
    }

    async sql(query, params) {
        // run sql
    }

    async commit() {
        // commit
    }

    initTypeMap() {
        this.type_map = {
            'Currency': 'real'
            , 'Int': 'integer'
            , 'Float': 'real'
            , 'Percent': 'real'
            , 'Check': 'integer'
            , 'Small Text': 'text'
            , 'Long Text': 'text'
            , 'Code': 'text'
            , 'Text Editor': 'text'
            , 'Date': 'text'
            , 'Datetime': 'text'
            , 'Time': 'text'
            , 'Text': 'text'
            , 'Data': 'text'
            , 'Link': 'text'
            , 'Dynamic Link': 'text'
            , 'Password': 'text'
            , 'Select': 'text'
            , 'Read Only': 'text'
            , 'Attach': 'text'
            , 'Attach Image': 'text'
            , 'Signature': 'text'
            , 'Color': 'text'
            , 'Barcode': 'text'
            , 'Geolocation': 'text'
        }
    }

}
