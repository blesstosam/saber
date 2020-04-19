const {
  getIdFromMap,
  getNameFromMap,
  renderPermalink
} = require('./utils')

const ID = 'query-posts'

exports.name = ID

exports.apply = (api, options = {}) => {
  api.hooks.onCreatePages.tap(ID, () => {
    const allLocalePaths = new Set(
      ['/'].concat(Object.keys(api.config.locales || {}))
    )
    for (const currentLocalePath of allLocalePaths) {
      injectPosts({
        currentLocalePath,
        tagsMap: options.tagsMap,
        categoriesMap: options.categoriesMap,
        permalinks: Object.assign(
          {
            category: '/categories/:slug',
            tag: '/tags/:slug'
          },
          options.permalinks
        )
      })
    }
  })

  function injectPosts({
    currentLocalePath,
    tagsMap,
    categoriesMap,
    permalinks
  }) {
    const allPosts = new Set()
    const injectPostsToPages = new Set()
    const allTagPosts = new Map()
    const allCategoryPosts = new Map()

    tagsMap = Object.assign({}, tagsMap)
    categoriesMap = Object.assign({}, categoriesMap)

    for (const page of api.pages.values()) {
      if (page.draft) {
        continue
      }

      const matchedLocalePath = api.pages.getMatchedLocalePath(page.permalink)
      if (matchedLocalePath !== currentLocalePath) {
        continue
      }

      if (page.injectAllPosts) {
        injectPostsToPages.add(page)
        continue
      }

      if (page.type === 'post') {
        const pagePublicFields = api.pages.getPagePublicFields(page)
        allPosts.add(pagePublicFields)

        // Group posts for tag pages
        const tags = [].concat(page.tags || [])
        if (tags.length > 0) {
          page.tagsInfo = []
          for (const tag of tags) {
            const tagSlug = getIdFromMap(tagsMap, tag)
            page.tagsInfo.push({
              name: tag,
              permalink: renderPermalink(permalinks.tag, {
                name: tagSlug,
                slug: tagSlug
              })
            })
            const posts = allTagPosts.get(tagSlug) || new Set()
            posts.add(pagePublicFields)
            allTagPosts.set(tagSlug, posts)
          }
        }

        // Group posts for category pages
        const categories = []
          .concat(page.categories || [])
          .map(v => (Array.isArray(v) ? v : v.split('/')))

        if (categories.length > 0) {
          page.categoriesInfo = []
          for (const category of categories) {
            for (const index of category.keys()) {
              const categorySlug = category
                .slice(0, index + 1)
                .map(name => getIdFromMap(categoriesMap, name))
                .join('/')
              page.categoriesInfo.push({
                // The base name of the category
                name: category[index],
                permalink: renderPermalink(permalinks.category, {
                  name: categorySlug,
                  slug: categorySlug
                })
              })
              const posts = allCategoryPosts.get(categorySlug) || new Set()
              posts.add(pagePublicFields)
              allCategoryPosts.set(categorySlug, posts)
            }
          }
        }
      }
    }

    // Add all posts to those pages
    if (injectPostsToPages.size > 0) {
      injectToPages(injectPostsToPages, allPosts)
    }

    // Add tag pages
    for (const [tag, tagPosts] of allTagPosts.entries()) {
      injectToPages(
        new Set([
          {
            isTagPage: true,
            layout: 'tag',
            permalink: renderPermalink(permalinks.tag, {
              name: tag,
              slug: tag
            }),
            slug: tag,
            internal: {
              id: `internal_blog__tag__${tag}`,
              // So that this page will be removed before next `onCreatePages` hook in watch mode
              parent: true
            }
          }
        ]),
        tagPosts,
        {
          tag: getNameFromMap(tagsMap, tag)
        }
      )
    }

    // Add category pages
    for (const [category, categoryPosts] of allCategoryPosts.entries()) {
      injectToPages(
        new Set([
          {
            isCategoryPage: true,
            layout: 'category',
            permalink: renderPermalink(permalinks.category, {
              name: category,
              slug: category
            }),
            slug: category,
            internal: {
              id: `internal_blog__category__${category}`,
              // So that this page will be removed before next `onCreatePages` hook in watch mode
              parent: true
            }
          }
        ]),
        categoryPosts,
        {
          category: category
            .split('/')
            .map(v => getNameFromMap(categoriesMap, v))
            .join('/')
        }
      )
    }

    function injectToPages(pages, posts, pageProp) {
      if (pages.size > 0) {
        for (const page of pages) {
          const newPage = Object.assign({}, page, {
            posts: [...posts],
            paginate: {
              orderBy: 'createdAt',
              dataKey: 'posts',
              ...page.paginate
            }
          })

          api.pages.createPage(newPage)
        }
      }
    }
  }
}
