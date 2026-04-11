import Select, { type SingleValue, type StylesConfig } from 'react-select';

export type SelectOption = {
  value: string;
  label: string;
};

type StyledSelectProps = {
  options: SelectOption[];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  isSearchable?: boolean;
};

const selectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    borderRadius: 10,
    minHeight: 38,
    backgroundColor: '#f8fbff',
    borderColor: state.isFocused ? '#00F1C6' : '#d4dbe7',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 241, 198, 0.15)' : 'none',
    '&:hover': {
      borderColor: '#00F1C6'
    }
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #d4dbe7',
    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)'
  }),
  option: (base, state) => ({
    ...base,
    fontSize: 12,
    backgroundColor: state.isSelected ? 'rgba(0, 241, 198, 0.22)' : state.isFocused ? 'rgba(0, 241, 198, 0.1)' : '#ffffff',
    color: '#0f172a',
    cursor: 'pointer'
  }),
  singleValue: (base) => ({
    ...base,
    fontSize: 12,
    color: '#0f172a'
  }),
  placeholder: (base) => ({
    ...base,
    fontSize: 12,
    color: '#64748b'
  }),
  input: (base) => ({
    ...base,
    fontSize: 12,
    color: '#0f172a'
  }),
  indicatorSeparator: () => ({
    display: 'none'
  })
};

export function StyledSelect({ options, value, placeholder, onChange, isSearchable = true }: StyledSelectProps) {
  const selectedOption = options.find((option) => option.value === value) ?? null;

  const handleChange = (option: SingleValue<SelectOption>) => {
    onChange(option?.value ?? '');
  };

  return (
    <Select
      className="text-xs"
      isSearchable={isSearchable}
      menuPortalTarget={typeof window !== 'undefined' ? document.body : null}
      noOptionsMessage={() => 'Sin coincidencias'}
      options={options}
      placeholder={placeholder}
      styles={selectStyles}
      value={selectedOption}
      onChange={handleChange}
    />
  );
}
