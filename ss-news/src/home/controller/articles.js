'use strict';

import Base from './base.js';
import request from 'request';
import cheerio from 'cheerio';

export default class extends Base {


    // path = "/articles/get"
    async getAction() { // async同步
        let articles = this.model("articles");
        //交给数据库处理 处理完后再返回
        let data = await articles.find(this.param("id"));
        this.json(data);
    }

    // "/articles/gets"
    async getsAction() {
        let page = this.param("page") || 1;
        let rows = this.param("rows") || 10;
        let articles = this.model("articles");
        // 不包含content字段
        let data = await articles.limit((page - 1) * rows, rows).fieldReverse(["content"]).order("id desc").select();
        this.json(data);
    }


}