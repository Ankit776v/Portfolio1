import { useSearchParams } from 'react-router-dom';
import { filterKeys, languages, genres } from '../catalogue-filters.js';

export default function CatalogueFilters({ type }) {
  const [params,setParams] = useSearchParams();
  const currentYear = new Date().getFullYear();
  const years = Array.from({length:currentYear-1890+6},(_,index)=>currentYear+5-index);
  const active = filterKeys.some(key => params.get(key));
  function change(key,value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key,value); else next.delete(key);
    next.delete('page'); setParams(next);
  }
  return <section className="catalogue-filters" aria-label={`${type === 'tv' ? 'Series' : 'Movie'} filters`}>
    <label>Original language<select value={params.get('originalLanguage') || ''} onChange={event=>change('originalLanguage',event.target.value)}><option value="">All languages</option>{languages.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
    <label>Genre<select value={params.get('genre') || ''} onChange={event=>change('genre',event.target.value)}><option value="">All genres</option>{genres[type].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <label>{type === 'tv' ? 'First aired' : 'Release year'}<select value={params.get('year') || ''} onChange={event=>change('year',event.target.value)}><option value="">Any year</option>{years.map(year=><option key={year} value={year}>{year}</option>)}</select></label>
    <label>Minimum rating<select value={params.get('minRating') || ''} onChange={event=>change('minRating',event.target.value)}><option value="">Any rating</option>{[5,6,7,8,9].map(rating=><option key={rating} value={rating}>{rating}+ / 10</option>)}</select></label>
    <label>Sort by<select value={params.get('sort') || ''} onChange={event=>change('sort',event.target.value)}><option value="">Section default</option>{[['popular','Most popular'],['rating','Highest rated'],['newest','Newest first'],['oldest','Oldest first']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <button disabled={!active} onClick={()=>{const next=new URLSearchParams(params);for(const key of [...filterKeys,'page']) next.delete(key);setParams(next);}}>Clear filters</button>
    <p>Language filters the original production language. Ratings use TMDB’s 10-point scale.</p>
  </section>;
}
