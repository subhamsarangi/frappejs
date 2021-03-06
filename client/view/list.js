const frappe = require('frappejs');

module.exports = class BaseList {
    constructor({doctype, parent, fields, page}) {
        Object.assign(this, arguments[0]);

        this.meta = frappe.getMeta(this.doctype);

        this.start = 0;
        this.pageLength = 20;

        this.body = null;
        this.rows = [];
        this.data = [];
    }

    async refresh() {
        return await this.run();
    }

    async run() {
        this.makeBody();

        let data = await this.getData();

        for (let i=0; i< Math.min(this.pageLength, data.length); i++) {
            this.renderRow(this.start + i, data[i]);
        }

        if (this.start > 0) {
            this.data = this.data.concat(data);
        } else {
            this.data = data;
        }

        this.clearEmptyRows();
        this.updateMore(data.length > this.pageLength);
    }

    async getData() {
        return await frappe.db.getAll({
            doctype: this.doctype,
            fields: this.getFields(),
            filters: this.getFilters(),
            start: this.start,
            limit: this.pageLength + 1
        });
    }

    getFields() {
        return ['name'];
    }

    async append() {
        this.start += this.pageLength;
        await this.run();
    }

    getFilters() {
        let filters = {};
        if (this.searchInput.value) {
            filters.keywords = ['like', '%' + this.searchInput.value + '%'];
        }
        return filters;
    }

    makeBody() {
        if (!this.body) {
            this.makeToolbar();
            this.parent.classList.add('list-page');
            this.body = frappe.ui.add('div', 'list-body', this.parent);
            this.body.setAttribute('data-doctype', this.doctype);
            this.makeMoreBtn();
        }
    }

    makeToolbar() {
        this.makeSearch();
        this.btnNew = this.page.addButton(frappe._('New'), 'btn-primary', async () => {
            await frappe.router.setRoute('new', this.doctype);
        })
        this.btnDelete = this.page.addButton(frappe._('Delete'), 'btn-secondary hide', async () => {
            await frappe.db.deleteMany(this.doctype, this.getCheckedRowNames());
            await this.refresh();
        });
        this.page.body.addEventListener('click', (event) => {
            if(event.target.classList.contains('checkbox')) {
                this.btnDelete.classList.toggle('hide', this.getCheckedRowNames().length===0);
            }
        })
    }

    makeSearch() {
        this.toolbar = frappe.ui.add('div', 'list-toolbar', this.parent);
        this.toolbar.innerHTML = `
            <div class="input-group list-search">
                <input class="form-control" type="text" placeholder="Search...">
                <div class="input-group-append">
                    <button class="btn btn-outline-secondary btn-search">Search</button>
                </div>
            </div>
        `;

        this.searchInput = this.toolbar.querySelector('input');
        this.searchInput.addEventListener('keypress', (event) => {
            if (event.keyCode===13) {
                this.refresh();
            }
        });

        this.btnSearch = this.toolbar.querySelector('.btn-search');
        this.btnSearch.addEventListener('click', (event) => {
            this.refresh();
        });
    }

    makeMoreBtn() {
        this.btnMore = frappe.ui.add('button', 'btn btn-secondary hide', this.parent);
        this.btnMore.textContent = 'More';
        this.btnMore.addEventListener('click', () => {
            this.append();
        })
    }

    renderRow(i, data) {
        let row = this.getRow(i);
        row.innerHTML = this.getRowBodyHTML(data);
        row.setAttribute('data-name', data.name);
        row.style.display = 'flex';
    }

    getRowBodyHTML(data) {
        return `<div class="col-1">
            <input class="checkbox" type="checkbox" data-name="${data.name}">
        </div>` + this.getRowHTML(data);
    }

    getRowHTML(data) {
        return `<div class="col-11">${data.name}</div>`;
    }

    getRow(i) {
        if (!this.rows[i]) {
            this.rows[i] = frappe.ui.add('div', 'list-row row no-gutters', this.body);

            // open on click
            let doctype = this.doctype;
            this.rows[i].addEventListener('click', function(e) {
                if (!e.target.tagName !== 'input') {
                    let name = this.getAttribute('data-name');
                    frappe.router.setRoute('edit', doctype, name);
                }
            });
        }
        return this.rows[i];
    }

    getCheckedRowNames() {
        return [...this.body.querySelectorAll('.checkbox:checked')].map(check => check.getAttribute('data-name'));
    }

    clearEmptyRows() {
        if (this.rows.length > this.data.length) {
            for (let i=this.data.length; i < this.rows.length; i++) {
                let row = this.getRow(i);
                row.innerHTML = '';
                row.style.display = 'none';
            }
        }
    }

    updateMore(show) {
        if (show) {
            this.btnMore.classList.remove('hide');
        } else {
            this.btnMore.classList.add('hide');
        }
    }

};